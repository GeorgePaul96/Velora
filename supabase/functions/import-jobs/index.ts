import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i+1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip next double quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentVal.trim());
      if (row.length > 1 || row[0] !== "") {
        lines.push(row);
      }
      row = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  if (currentVal !== "" || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines;
}

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

    // Get CSV content from body (raw text)
    const csvText = await req.text();
    if (!csvText) {
      return new Response(JSON.stringify({ error: "CSV body is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) {
      return new Response(JSON.stringify({ error: "CSV lacks data records" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = parsed[0].map(h => h.toLowerCase().trim());
    
    // Column index lookup
    const refIdx = headers.indexOf("reference");
    const custIdx = headers.indexOf("customer_name");
    const vtIdx = headers.indexOf("vehicle_type");
    const siteIdx = headers.indexOf("site_label");
    const latIdx = headers.indexOf("latitude");
    const lngIdx = headers.indexOf("longitude");
    const radiusIdx = headers.indexOf("radius_m");
    const seqIdx = headers.indexOf("sequence");
    const slotIdx = headers.indexOf("booking_slot_at");

    if (refIdx === -1 || custIdx === -1 || vtIdx === -1 || siteIdx === -1 || latIdx === -1 || lngIdx === -1) {
      return new Response(JSON.stringify({ error: "Missing required columns in CSV header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure we have a csv_import provider record
    let { data: provider } = await supabase
      .from("integration_provider")
      .select("id")
      .eq("tenant_id", appUser.tenant_id)
      .eq("provider_name", "csv_import")
      .maybeSingle();

    if (!provider) {
      const { data: newProvider } = await supabase
        .from("integration_provider")
        .insert({
          tenant_id: appUser.tenant_id,
          provider_name: "csv_import",
          is_active: true
        })
        .select("id")
        .single();
      provider = newProvider;
    }

    // Group stops by job reference
    const jobsMap = new Map<string, any>();

    for (let i = 1; i < parsed.length; i++) {
      const row = parsed[i];
      if (row.length < headers.length) continue; // skip incomplete rows

      const ref = row[refIdx];
      const customerName = row[custIdx];
      const vehicleType = row[vtIdx];
      
      const siteLabel = row[siteIdx];
      const latitude = parseFloat(row[latIdx]);
      const longitude = parseFloat(row[lngIdx]);
      
      const radiusM = radiusIdx !== -1 ? parseInt(row[radiusIdx]) || 150 : 150;
      const sequence = seqIdx !== -1 ? parseInt(row[seqIdx]) || 1 : 1;
      const bookingSlotAt = slotIdx !== -1 ? row[slotIdx] || null : null;

      if (!ref || !customerName || !vehicleType || !siteLabel || isNaN(latitude) || isNaN(longitude)) {
        // Log parse failure in sync log
        await supabase.from("integration_sync_log").insert({
          tenant_id: appUser.tenant_id,
          provider_id: provider!.id,
          status: "failed",
          error_details: { error: `Validation error at row ${i+1}: Missing required cells.` }
        });
        return new Response(JSON.stringify({ error: `Validation error at row ${i+1}: Missing required fields` }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!jobsMap.has(ref)) {
        jobsMap.set(ref, {
          reference: ref,
          customerName,
          vehicleType,
          stops: []
        });
      }

      jobsMap.get(ref).stops.push({
        sequence,
        siteLabel,
        latitude,
        longitude,
        radiusM,
        bookingSlotAt
      });
    }

    // Convert map to array
    const jobsArray = Array.from(jobsMap.values());

    // Sort stops per job by sequence
    for (const job of jobsArray) {
      job.stops.sort((a: any, b: any) => a.sequence - b.sequence);
    }

    // Invoke atomic SQL transaction RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("import_jobs_json", {
      p_tenant_id: appUser.tenant_id,
      p_provider_id: provider!.id,
      p_jobs_data: jobsArray
    });

    if (rpcError) {
      // Log DB failure in sync log
      await supabase.from("integration_sync_log").insert({
        tenant_id: appUser.tenant_id,
        provider_id: provider!.id,
        status: "failed",
        error_details: { error: rpcError.message }
      });
      return new Response(JSON.stringify({ error: "Import transaction failed", details: rpcError.message }), {
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
