import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tms-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Missing tenantId query parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: HMAC signature validation from TMS header (placeholder/basic check)
    const signature = req.headers.get("x-tms-signature");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch integration provider details
    let { data: provider } = await supabase
      .from("integration_provider")
      .select("id, is_active, credentials")
      .eq("tenant_id", tenantId)
      .eq("provider_name", "mandata_tms")
      .maybeSingle();

    if (!provider) {
      // Auto-create deactivated provider if not configured
      const { data: newProvider } = await supabase
        .from("integration_provider")
        .insert({
          tenant_id: tenantId,
          provider_name: "mandata_tms",
          is_active: false
        })
        .select("id, is_active")
        .single();
      provider = newProvider;
    }

    if (!provider?.is_active) {
      return new Response(JSON.stringify({ error: "Mandata TMS integration is deactivated for this tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    if (!payload.consignmentRef || !payload.customerName || !payload.vehicleType || !payload.stops) {
      return new Response(JSON.stringify({ error: "Invalid TMS payload structure" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Mandata TMS structure to our standard JSON import structure
    const mappedJob = {
      reference: payload.consignmentRef,
      customerName: payload.customerName,
      vehicleType: payload.vehicleType,
      stops: payload.stops.map((s: any) => ({
        sequence: s.sequence,
        siteLabel: s.siteName,
        latitude: s.latitude,
        longitude: s.longitude,
        radiusM: s.radius || 150,
        bookingSlotAt: s.bookingSlot || null
      }))
    };

    // Invoke import RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("import_jobs_json", {
      p_tenant_id: tenantId,
      p_provider_id: provider.id,
      p_jobs_data: [mappedJob] // single job array
    });

    if (rpcError) {
      await supabase.from("integration_sync_log").insert({
        tenant_id: tenantId,
        provider_id: provider.id,
        status: "failed",
        error_details: { error: rpcError.message }
      });
      return new Response(JSON.stringify({ error: "Failed to ingest job stops", details: rpcError.message }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(rpcResult), {
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
