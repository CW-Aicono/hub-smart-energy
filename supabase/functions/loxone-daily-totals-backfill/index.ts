// Daily cron (01:05 UTC ≙ 02:05 CET / 03:05 CEST):
// Holt für JEDE aktive Loxone-Integration die Tagessumme des Vortags
// (im Miniserver-Intervall, z.B. 30/60 Min) und überschreibt damit
// `meter_period_totals`. Die feinen 5-Min-Live-Werte in
// `meter_power_readings_5min` bleiben UNANGETASTET (totalsOnly=true).
//
// Zweck: Tagessummen in AICONO und Loxone-App synchron halten, auch wenn
// einzelne Live-Syncs (Internet-Ausfall, etc.) Lücken hinterlassen haben.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("loxone-daily-totals-backfill: starting…");

  try {
    // Vortag in Europe/Berlin (Cron läuft 01:05 UTC → Berlin ist 02:05/03:05,
    // also sicher nach Mitternacht lokal).
    const berlinNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })
    );
    const y = new Date(berlinNow);
    y.setDate(y.getDate() - 1);
    const yyyy = y.getFullYear();
    const mm = String(y.getMonth() + 1).padStart(2, "0");
    const dd = String(y.getDate()).padStart(2, "0");
    const dayIso = `${yyyy}-${mm}-${dd}`;
    console.log(`Backfilling daily totals for ${dayIso} (Europe/Berlin)`);

    // Alle aktiven Loxone-Integrationen
    const { data: integrations, error } = await supabase
      .from("location_integrations")
      .select("id, integration:integrations(type)")
      .eq("is_enabled", true);

    if (error) {
      console.error("Failed to list integrations:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loxone = (integrations || []).filter(
      (li: any) =>
        li.integration?.type === "loxone" ||
        li.integration?.type === "loxone_miniserver"
    );
    console.log(`Found ${loxone.length} active Loxone integrations`);

    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    for (const li of loxone) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/loxone-api`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({
            locationIntegrationId: li.id,
            action: "backfillStatistics",
            fromDate: dayIso,
            toDate: dayIso,
            totalsOnly: true,
          }),
        });
        const text = await resp.text();
        if (!resp.ok) {
          console.warn(`Integration ${li.id} backfill failed: HTTP ${resp.status} ${text.slice(0, 200)}`);
          results.push({ id: li.id, ok: false, message: `HTTP ${resp.status}` });
        } else {
          console.log(`Integration ${li.id}: ${text.slice(0, 200)}`);
          results.push({ id: li.id, ok: true });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Integration ${li.id} error:`, msg);
        results.push({ id: li.id, ok: false, message: msg });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    return new Response(
      JSON.stringify({
        success: true,
        day: dayIso,
        total: loxone.length,
        succeeded: okCount,
        failed: loxone.length - okCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("loxone-daily-totals-backfill fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
