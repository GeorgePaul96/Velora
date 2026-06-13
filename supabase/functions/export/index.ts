import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fromDate = url.searchParams.get("from");
    const toDate = url.searchParams.get("to");

    if (!fromDate || !toDate) {
      return new Response(JSON.stringify({ error: "Missing parameters: 'from' and 'to' dates required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Get tenant ID
    const { data: appUser, error: profileError } = await supabase
      .from("app_user")
      .select("tenant_id")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !appUser) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Jobs matching filter
    const { data: jobs, error: jobsError } = await supabase
      .from("job")
      .select(`
        reference,
        status,
        charge_pence,
        billable_minutes,
        calc_result,
        customer:customer_id(name),
        vehicle_type:vehicle_type_id(label)
      `)
      .eq("tenant_id", appUser.tenant_id)
      .in("status", ["calculated", "flagged", "invoiced", "disputed", "under_review", "approved", "rejected", "paid"])
      .gte("created_at", fromDate)
      .lte("created_at", toDate)
      .order("created_at", { ascending: true });

    if (jobsError) {
      return new Response(JSON.stringify({ error: "Failed to load jobs for export", details: jobsError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CSV header row
    let csvContent = "reference,customer_name,vehicle_type,billable_minutes,rate_pounds,charge_pounds,status,computed_at\n";

    if (jobs) {
      for (const j of jobs) {
        const customerName = j.customer ? (j.customer as any).name : "Unknown";
        const vehicleLabel = j.vehicle_type ? (j.vehicle_type as any).label : "Unknown";
        
        const chargePounds = j.charge_pence !== null ? (j.charge_pence / 100).toFixed(2) : "0.00";
        
        const hourlyRatePence = j.calc_result?.config?.hourlyRatePence || 0;
        const ratePounds = (hourlyRatePence / 100).toFixed(2);
        
        const computedAt = j.calc_result?.computedAt || "";

        // Escape references or names containing commas
        const escapedRef = `"${j.reference.replace(/"/g, '""')}"`;
        const escapedCust = `"${customerName.replace(/"/g, '""')}"`;
        const escapedVehicle = `"${vehicleLabel.replace(/"/g, '""')}"`;

        csvContent += `${escapedRef},${escapedCust},${escapedVehicle},${j.billable_minutes || 0},${ratePounds},${chargePounds},${j.status},${computedAt}\n`;
      }
    }

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="waiting_time_export_${fromDate}_to_${toDate}.csv"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
