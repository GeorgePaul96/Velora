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

    // Create service role client to fetch and update details across tenants securely
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create user client to verify user credentials
    const userClient = createClient(supabaseUrl, supabaseUrl);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials", details: authError }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user tenant details
    const { data: appUser, error: appUserError } = await supabase
      .from("app_user")
      .select("tenant_id, role")
      .eq("auth_id", user.id)
      .single();

    if (appUserError || !appUser) {
      return new Response(JSON.stringify({ error: "User profile not found", details: appUserError }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Job details
    const { data: job, error: jobError } = await supabase
      .from("job")
      .select("tenant_id, customer_id, vehicle_type_id, status, booking_slot_at, reference, created_at")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found", details: jobError }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure tenant matches
    if (job.tenant_id !== appUser.tenant_id) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve Contract or base Rate
    // 3.4 customer contract override check
    const referenceDate = job.booking_slot_at || job.created_at || new Date().toISOString();
    const { data: contracts, error: contractQueryError } = await supabase
      .from("customer_contract")
      .select("id")
      .eq("customer_id", job.customer_id)
      .lte("effective_date", referenceDate)
      .gte("expiry_date", referenceDate)
      .order("version", { ascending: false });

    let activeContractRule = null;
    if (!contractQueryError && contracts && contracts.length > 0) {
      // Fetch matching contract rule for the vehicle type
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
      // Fallback: Default customer parameters & customer rates
      const { data: customerRate } = await supabase
        .from("customer_rate")
        .select("hourly_rate_pence, free_time_minutes")
        .eq("customer_id", job.customer_id)
        .eq("vehicle_type_id", job.vehicle_type_id)
        .maybeSingle();

      if (!customerRate) {
        return new Response(JSON.stringify({ error: "no_rate_configured" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: customer } = await supabase
        .from("customer")
        .select("free_time_basis, free_time_minutes, rounding_increment, rounding_mode, daily_cap_pence")
        .eq("id", job.customer_id)
        .single();

      if (!customer) {
        return new Response(JSON.stringify({ error: "Customer not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      config = {
        freeTimeBasis: customer.free_time_basis as "per_job" | "per_stop",
        freeTimeMinutes: customerRate.free_time_minutes !== null ? customerRate.free_time_minutes : customer.free_time_minutes,
        hourlyRatePence: customerRate.hourly_rate_pence,
        roundingIncrement: customer.rounding_increment,
        roundingMode: customer.rounding_mode as "up" | "exact",
        dailyCapPence: customer.daily_cap_pence,
      };
    }

    // Load Job Stops
    const { data: stops, error: stopsError } = await supabase
      .from("job_stop")
      .select("sequence, booking_slot_at, arrival_at, departure_at")
      .eq("job_id", jobId)
      .order("sequence", { ascending: true });

    if (stopsError) {
      return new Response(JSON.stringify({ error: "Stops load failed", details: stopsError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate charge
    const calcResult = calculate({
      stops: stops.map((s) => ({
        sequence: s.sequence,
        bookingSlotAt: s.booking_slot_at,
        arrivalAt: s.arrival_at,
        departureAt: s.departure_at,
      })),
      config,
    });

    // Update job status & calculation result
    let nextStatus = job.status;
    if (calcResult.status === "flagged") {
      nextStatus = "flagged";
    } else if (calcResult.status === "calculated") {
      if (job.status === "open" || job.status === "captured" || job.status === "flagged") {
        nextStatus = "calculated";
      }
    }

    const { error: updateError } = await supabase
      .from("job")
      .update({
        calc_result: calcResult,
        status: nextStatus,
      })
      .eq("id", jobId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to persist calculation", details: updateError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result: calcResult }), {
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
