import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Image } from "imagescript";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const formatGBP = (pence: number) => {
  return "£" + (pence / 100).toFixed(2);
};

const formatLondonTime = (isoString: string | null) => {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), {
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

    // Get app user profile
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

    // Fetch Job & Tenant
    const { data: job, error: jobError } = await supabase
      .from("job")
      .select("tenant_id, customer_id, vehicle_type_id, reference, status, calc_result")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.tenant_id !== appUser.tenant_id) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Preconditions: status in ('calculated','flagged','invoiced','disputed','under_review','approved','rejected','paid')
    const allowedStatuses = ["calculated", "flagged", "invoiced", "disputed", "under_review", "approved", "rejected", "paid"];
    if (!allowedStatuses.includes(job.status)) {
      return new Response(
        JSON.stringify({ error: `Precondition failed. Job is in '${job.status}' status, calculation required first.` }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const calcResult = job.calc_result;
    if (!calcResult) {
      return new Response(JSON.stringify({ error: "No calculation results found" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related detail models
    const { data: tenant } = await supabase.from("tenant").select("name").eq("id", job.tenant_id).single();
    const { data: customer } = await supabase.from("customer").select("name, terms_template_id").eq("id", job.customer_id).single();
    const { data: vehicleType } = await supabase.from("vehicle_type").select("label").eq("id", job.vehicle_type_id).single();

    // Fetch Stops and Locations
    const { data: stops } = await supabase
      .from("job_stop")
      .select("id, sequence, booking_slot_at, arrival_at, departure_at, source, site:site_id(label, latitude, longitude)")
      .eq("job_id", jobId)
      .order("sequence", { ascending: true });

    // Fetch Evidence Items
    const stopIds = stops ? stops.map((s) => s.id) : [];
    const { data: evidenceItems } = stopIds.length > 0
      ? await supabase
          .from("evidence_item")
          .select("job_stop_id, kind, storage_path, text_value, captured_at")
          .in("job_stop_id", stopIds)
      : { data: [] };

    // Fetch Terms template
    let termsBody = "";
    if (customer?.terms_template_id) {
      const { data: terms } = await supabase.from("terms_template").select("body_md").eq("id", customer.terms_template_id).single();
      if (terms) {
        termsBody = terms.body_md;
      }
    } else {
      const { data: defaultTerms } = await supabase.from("terms_template").select("body_md").eq("tenant_id", job.tenant_id).limit(1).maybeSingle();
      if (defaultTerms) {
        termsBody = defaultTerms.body_md;
      }
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Initial page
    let page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    const checkNewPage = (needed: number) => {
      if (y - needed < 50) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = 790;
      }
    };

    // Draw Header
    page.drawText(tenant?.name || "Haulier Company", { x: 40, y, size: 16, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= 18;
    page.drawText("Waiting Time Statement", { x: 40, y, size: 22, font: fontBold, color: rgb(0.12, 0.28, 0.6) });
    y -= 25;

    // Line separator
    page.drawRectangle({ x: 40, y, width: 515, height: 1.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 20;

    // Metadata block
    page.drawText("Reference: " + job.reference, { x: 40, y, size: 10, font: fontBold });
    page.drawText("Customer: " + (customer?.name || "N/A"), { x: 200, y, size: 10, font: fontRegular });
    page.drawText("Vehicle Type: " + (vehicleType?.label || "N/A"), { x: 400, y, size: 10, font: fontRegular });
    y -= 15;
    page.drawText("Generated At: " + formatLondonTime(new Date().toISOString()), { x: 40, y, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    y -= 25;

    // Charge Summary Box (styled banner)
    checkNewPage(85);
    page.drawRectangle({ x: 40, y - 65, width: 515, height: 65, color: rgb(0.95, 0.96, 0.98), borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 });
    page.drawText("CHARGES RECOVERED", { x: 55, y - 18, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(formatGBP(calcResult.chargePence || 0), { x: 55, y - 48, size: 24, font: fontBold, color: rgb(0.12, 0.52, 0.24) });

    page.drawText("Billable Time: " + calcResult.roundedMinutes + " mins (" + calcResult.billableMinutes + " raw)", { x: 260, y - 20, size: 9, font: fontRegular });
    page.drawText("Hourly Rate: " + formatGBP(calcResult.chargePence ? Math.round((calcResult.chargePence / (calcResult.roundedMinutes || 60)) * 60) : 0) + "/hr", { x: 260, y - 35, size: 9, font: fontRegular });
    page.drawText("Status: " + job.status.toUpperCase(), { x: 260, y - 50, size: 9, font: fontBold, color: calcResult.status === "flagged" ? rgb(0.8, 0.2, 0.2) : rgb(0.2, 0.5, 0.2) });
    y -= 85;

    // Timeline Table header
    checkNewPage(45);
    page.drawText("Timeline & Logged Stops", { x: 40, y, size: 14, font: fontBold, color: rgb(0.12, 0.28, 0.6) });
    y -= 20;

    // Table Columns: Site, Slot, Arrival, Departure, OnSite, Billable
    const tableHeaderY = y;
    page.drawRectangle({ x: 40, y: tableHeaderY - 5, width: 515, height: 20, color: rgb(0.9, 0.9, 0.9) });
    page.drawText("Site", { x: 45, y: tableHeaderY, size: 8, font: fontBold });
    page.drawText("Booking Slot", { x: 155, y: tableHeaderY, size: 8, font: fontBold });
    page.drawText("Arrival", { x: 260, y: tableHeaderY, size: 8, font: fontBold });
    page.drawText("Departure", { x: 365, y: tableHeaderY, size: 8, font: fontBold });
    page.drawText("On Site", { x: 460, y: tableHeaderY, size: 8, font: fontBold });
    page.drawText("Billable", { x: 510, y: tableHeaderY, size: 8, font: fontBold });
    y -= 25;

    // Draw Table Rows
    if (stops) {
      for (const stop of stops) {
        checkNewPage(25);
        const stopCalc = calcResult.perStop?.find((s: any) => s.sequence === stop.sequence);

        const siteLabel = (stop.site as any)?.label || `Stop ${stop.sequence}`;
        const truncatedLabel = siteLabel.length > 20 ? siteLabel.slice(0, 18) + ".." : siteLabel;

        page.drawText(truncatedLabel, { x: 45, y, size: 8, font: fontRegular });
        page.drawText(formatLondonTime(stop.booking_slot_at), { x: 155, y, size: 8, font: fontRegular });
        page.drawText(formatLondonTime(stop.arrival_at), { x: 260, y, size: 8, font: fontRegular });
        page.drawText(formatLondonTime(stop.departure_at), { x: 365, y, size: 8, font: fontRegular });
        page.drawText((stopCalc?.onSiteMinutes || 0) + "m", { x: 460, y, size: 8, font: fontRegular });
        page.drawText((stopCalc?.billableMinutes || 0) + "m", { x: 510, y, size: 8, font: fontBold });
        
        y -= 15;
        // Subtle divider
        page.drawRectangle({ x: 40, y: y + 2, width: 515, height: 0.5, color: rgb(0.9, 0.9, 0.9) });
      }
    }
    y -= 15;

    // Map pins / Geofence Audit
    let hasGeofenceNote = false;
    if (stops) {
      for (const stop of stops) {
        if (stop.source === "geofence" && (stop.site as any)?.latitude) {
          if (!hasGeofenceNote) {
            checkNewPage(40);
            page.drawText("GPS Geofence Audits", { x: 40, y, size: 12, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
            y -= 15;
            hasGeofenceNote = true;
          }
          checkNewPage(15);
          page.drawText(`• Stop ${stop.sequence}: GPS-confirmed on-site within ${(stop.site as any).label} geofence at coordinates [${(stop.site as any).latitude.toFixed(5)}, ${(stop.site as any).longitude.toFixed(5)}]`, {
            x: 45,
            y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.4, 0.4, 0.4)
          });
          y -= 12;
        }
      }
    }
    y -= 15;

    // Evidence Items (Photos & POD refs)
    if (evidenceItems && evidenceItems.length > 0) {
      checkNewPage(40);
      page.drawText("Attached Evidence Items", { x: 40, y, size: 14, font: fontBold, color: rgb(0.12, 0.28, 0.6) });
      y -= 20;

      // Print POD refs and Notes
      for (const item of evidenceItems) {
        if (item.kind !== "photo") {
          checkNewPage(18);
          page.drawText(`${item.kind.toUpperCase()} - Stop ${stops?.find((s) => s.id === item.job_stop_id)?.sequence || ""}: `, { x: 45, y, size: 9, font: fontBold });
          page.drawText(item.text_value || "", { x: 140, y, size: 9, font: fontRegular });
          y -= 15;
        }
      }
      y -= 10;

      // Draw Photos thumbnails
      for (const item of evidenceItems) {
        if (item.kind === "photo" && item.storage_path) {
          checkNewPage(180);
          page.drawText(`Photo Evidence - Stop ${stops?.find((s) => s.id === item.job_stop_id)?.sequence || ""}`, { x: 45, y, size: 10, font: fontBold });
          y -= 15;

          try {
            // Download photo
            const { data: fileData, error: fileError } = await supabase.storage
              .from("evidence")
              .download(item.storage_path);

            if (!fileError && fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              const photoBytes = new Uint8Array(arrayBuffer);

              // Downscale using imagescript
              const image = await Image.decode(photoBytes);
              if (image.width > 1000 || image.height > 1000) {
                if (image.width > image.height) {
                  image.resize(1000, Image.RESIZE_AUTO);
                } else {
                  image.resize(Image.RESIZE_AUTO, 1000);
                }
              }
              const jpegBytes = await image.encodeJPEG();

              const embeddedPhoto = await pdfDoc.embedJpg(jpegBytes);
              
              // Draw photo (max height 120, maintain aspect ratio roughly)
              const ratio = embeddedPhoto.width / embeddedPhoto.height;
              const photoWidth = Math.min(200, 120 * ratio);
              const photoHeight = photoWidth / ratio;

              page.drawImage(embeddedPhoto, {
                x: 45,
                y: y - photoHeight,
                width: photoWidth,
                height: photoHeight
              });
              y -= (photoHeight + 20);
            } else {
              page.drawText(`[Failed to load photo: ${item.storage_path}]`, { x: 45, y, size: 9, font: fontRegular, color: rgb(0.8, 0.2, 0.2) });
              y -= 15;
            }
          } catch (imgErr) {
            page.drawText(`[Failed to embed photo: ${String(imgErr)}]`, { x: 45, y, size: 9, font: fontRegular, color: rgb(0.8, 0.2, 0.2) });
            y -= 15;
          }
        }
      }
    }
    y -= 10;

    // Conditions of Carriage / Terms Clause
    if (termsBody) {
      checkNewPage(120);
      page.drawText("Contractual waiting time terms", { x: 40, y, size: 12, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 15;

      // Draw boxed clause
      const boxHeight = Math.min(100, termsBody.length / 5 + 20);
      page.drawRectangle({
        x: 40,
        y: y - boxHeight,
        width: 515,
        height: boxHeight,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 0.5
      });

      // Split terms into lines
      const words = termsBody.split(" ");
      let line = "";
      let linesY = y - 15;
      for (const word of words) {
        const testLine = line + word + " ";
        if (testLine.length > 110) {
          page.drawText(line, { x: 50, y: linesY, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
          line = word + " ";
          linesY -= 10;
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x: 50, y: linesY, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
      }
      y -= (boxHeight + 20);
    }

    // Footer on the final page
    y = Math.max(50, y);
    page.drawText(`Generated by ${tenant?.name || "Haulier Company"}. Charged under the above conditions of carriage. Powered by WTR.`, {
      x: 40,
      y: 35,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evidence_pack_${job.reference}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
