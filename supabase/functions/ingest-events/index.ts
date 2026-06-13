import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";
import { calculate } from "@wtr/core";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify User JWT
    const userClient = createClient(supabaseUrl, supabaseUrl);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get app user details (Must be driver or owner/office)
    const { data: appUser, error: profileError } = await supabase
      .from("app_user")
      .select("id, tenant_id, role")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !appUser) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { events } = await req.json();
    if (!events || !Array.isArray(events)) {
      return new Response(JSON.stringify({ error: "Missing or invalid events array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modifiedJobIds = new Set<string>();

    for (const ev of events) {
      const {
        localId,
        jobId,
        stopSequence,
        type,
        occurredAt,
        lat,
        lng,
        accuracyM,
        source,
        photoBlobKey,
        textValue,
      } = ev;

      // 1. Verify job exists and driver is assigned (if user is driver)
      const { data: job, error: jobError } = await supabase
        .from("job")
        .select("tenant_id, driver_id")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        // Skip invalid job reference
        continue;
      }

      if (job.tenant_id !== appUser.tenant_id) {
        // Skip cross-tenant injections
        continue;
      }

      if (appUser.role === "driver" && job.driver_id !== appUser.id) {
        // Skip if driver is not assigned
        continue;
      }

      // 2. Idempotent check: Insert in event_log
      const { data: existingEvent } = await supabase
        .from("event_log")
        .select("id")
        .eq("id", localId)
        .maybeSingle();

      if (existingEvent) {
        // Event already processed
        continue;
      }

      // Insert raw event in event_log for audit trail
      const { error: logError } = await supabase.from("event_log").insert({
        id: localId,
        tenant_id: job.tenant_id,
        driver_id: appUser.id,
        job_id: jobId,
        stop_sequence: stopSequence,
        type,
        occurred_at: occurredAt,
        latitude: lat,
        longitude: lng,
        accuracy_m: accuracyM,
        source,
        storage_path: photoBlobKey,
        text_value: textValue,
      });

      if (logError) {
        continue;
      }

      // Fetch the target stop
      const { data: jobStop } = await supabase
        .from("job_stop")
        .select("id, arrival_at, departure_at")
        .eq("job_id", jobId)
        .eq("sequence", stopSequence)
        .single();

      if (!jobStop) {
        continue;
      }

      // 3. Process Event details
      if (type === "arrival") {
        // Last-write-wins by occurredAt
        const shouldUpdate = !jobStop.arrival_at || new Date(occurredAt) >= new Date(jobStop.arrival_at);
        if (shouldUpdate) {
          await supabase
            .from("job_stop")
            .update({
              arrival_at: occurredAt,
              source: source,
            })
            .eq("id", jobStop.id);
          modifiedJobIds.add(jobId);
        }
      } else if (type === "departure") {
        const shouldUpdate = !jobStop.departure_at || new Date(occurredAt) >= new Date(jobStop.departure_at);
        if (shouldUpdate) {
          await supabase
            .from("job_stop")
            .update({
              departure_at: occurredAt,
              source: source,
            })
            .eq("id", jobStop.id);
          modifiedJobIds.add(jobId);
        }
      } else if (type === "photo" || type === "pod_ref" || type === "note") {
        const kind = type === "photo" ? "photo" : (type === "pod_ref" ? "pod_ref" : "note");
        // Idempotent insert in evidence_item using localId
        await supabase.from("evidence_item").insert({
          id: localId,
          tenant_id: job.tenant_id,
          job_stop_id: jobStop.id,
          kind,
          storage_path: photoBlobKey || null,
          text_value: textValue || null,
          captured_at: occurredAt,
        });
      }
    }

    // 4. Auto-Calculate fully captured jobs
    for (const jobId of modifiedJobIds) {
      // Check if job stops are complete
      const { data: incompleteStops } = await supabase
        .from("job_stop")
        .select("id")
        .eq("job_id", jobId)
        .or("arrival_at.is.null,departure_at.is.null");

      if (incompleteStops && incompleteStops.length === 0) {
        // Fetch calculations config and run recalculation
        const { data: job } = await supabase
          .from("job")
          .select("tenant_id, customer_id, vehicle_type_id, booking_slot_at, created_at, status")
          .eq("id", jobId)
          .single();

        if (job) {
          // Resolve customer rate & config
          const referenceDate = job.booking_slot_at || job.created_at || new Date().toISOString();
          const { data: contracts } = await supabase
            .from("customer_contract")
            .select("id")
            .eq("customer_id", job.customer_id)
            .lte("effective_date", referenceDate)
            .gte("expiry_date", referenceDate)
            .order("version", { ascending: false });

          let activeContractRule = null;
          if (contracts && contracts.length > 0) {
            const { data: rule } = await supabase
              .from("contract_rule")
              .select("hourly_rate_pence, free_time_minutes, free_time_basis, rounding_increment, rounding_mode, daily_cap_pence")
              .eq("contract_id", contracts[0].id)
              .eq("vehicle_type_id", job.vehicle_type_id)
              .maybeSingle();
            
            if (rule) {
              activeContractRule = rule;
            }
          }

          let config = null;
          if (activeContractRule) {
            config = {
              freeTimeBasis: activeContractRule.free_time_basis as "per_job" | "per_stop",
              freeTimeMinutes: activeContractRule.free_time_minutes,
              hourlyRatePence: activeContractRule.hourly_rate_pence,
              roundingIncrement: activeContractRule.rounding_increment,
              roundingMode: activeContractRule.rounding_mode as "up" | "exact",
              dailyCapPence: activeContractRule.daily_cap_pence,
            };
          } else {
            const { data: customerRate } = await supabase
              .from("customer_rate")
              .select("hourly_rate_pence, free_time_minutes")
              .eq("customer_id", job.customer_id)
              .eq("vehicle_type_id", job.vehicle_type_id)
              .maybeSingle();

            const { data: customer } = await supabase
              .from("customer")
              .select("free_time_basis, free_time_minutes, rounding_increment, rounding_mode, daily_cap_pence")
              .eq("id", job.customer_id)
              .single();

            if (customerRate && customer) {
              config = {
                freeTimeBasis: customer.free_time_basis as "per_job" | "per_stop",
                freeTimeMinutes: customerRate.free_time_minutes !== null ? customerRate.free_time_minutes : customer.free_time_minutes,
                hourlyRatePence: customerRate.hourly_rate_pence,
                roundingIncrement: customer.rounding_increment,
                roundingMode: customer.rounding_mode as "up" | "exact",
                dailyCapPence: customer.daily_cap_pence,
              };
            }
          }

          if (config) {
            const { data: stops } = await supabase
              .from("job_stop")
              .select("sequence, booking_slot_at, arrival_at, departure_at")
              .eq("job_id", jobId)
              .order("sequence", { ascending: true });

            if (stops) {
              const calcResult = calculate({
                stops: stops.map((s) => ({
                  sequence: s.sequence,
                  bookingSlotAt: s.booking_slot_at,
                  arrivalAt: s.arrival_at,
                  departureAt: s.departure_at,
                })),
                config,
              });

              let nextStatus = job.status;
              if (calcResult.status === "flagged") {
                nextStatus = "flagged";
              } else if (calcResult.status === "calculated") {
                if (job.status === "open" || job.status === "captured" || job.status === "flagged") {
                  nextStatus = "calculated";
                }
              }

              await supabase
                .from("job")
                .update({
                  calc_result: calcResult,
                  status: nextStatus,
                })
                .eq("id", jobId);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
