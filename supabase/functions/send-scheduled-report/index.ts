import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom", gas: "Gas", waerme: "Wärme", wasser: "Wasser",
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Wöchentlich", monthly: "Monatlich", quarterly: "Quartalsweise", yearly: "Jährlich",
};

function getDateRange(frequency: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from: Date;

  switch (frequency) {
    case "weekly":
      from = new Date(now); from.setDate(now.getDate() - 7); break;
    case "quarterly":
      from = new Date(now); from.setMonth(now.getMonth() - 3); break;
    case "yearly":
      from = new Date(now); from.setFullYear(now.getFullYear() - 1); break;
    default: // monthly
      from = new Date(now); from.setMonth(now.getMonth() - 1); break;
  }

  return { from: from.toISOString().split("T")[0], to };
}

function buildCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(";");
  const body = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(";")).join("\n");
  return "\uFEFF" + header + "\n" + body;
}

function buildHTMLTable(rows: Record<string, unknown>[], title: string, dateRange: { from: string; to: string }): string {
  if (!rows.length) return `<p>Keine Daten im Zeitraum ${dateRange.from} – ${dateRange.to}</p>`;
  const keys = Object.keys(rows[0]);
  const headerRow = keys.map((k) => `<th style="border:1px solid #ddd;padding:6px 8px;background:#f5f5f5;text-align:left">${k}</th>`).join("");
  const bodyRows = rows.map((r) =>
    "<tr>" + keys.map((k) => `<td style="border:1px solid #ddd;padding:6px 8px">${r[k] ?? ""}</td>`).join("") + "</tr>"
  ).join("");

  return `
    <h2 style="font-family:Arial,sans-serif">${title}</h2>
    <p style="color:#666;font-size:12px">Zeitraum: ${dateRange.from} – ${dateRange.to} | ${rows.length} Datensätze</p>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = resendKey ? new Resend(resendKey) : null;

    // Accept optional schedule_id for manual trigger, otherwise process all due schedules
    let scheduleIds: string[] = [];
    try {
      const body = await req.json();
      if (body.schedule_id) scheduleIds = [body.schedule_id];
    } catch { /* no body = cron run */ }

    let query = supabase.from("report_schedules").select("*").eq("is_active", true);
    if (scheduleIds.length > 0) {
      query = query.in("id", scheduleIds);
    } else {
      // For cron: only schedules where next_run_at <= now or is null
      query = query.or("next_run_at.is.null,next_run_at.lte." + new Date().toISOString());
    }

    const { data: schedules, error: schedErr } = await query;
    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No schedules to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const schedule of schedules) {
      try {
        const { from, to } = getDateRange(schedule.frequency);

        // Get meters matching filters
        let meterQuery = supabase.from("meters").select("*").eq("tenant_id", schedule.tenant_id);
        if (schedule.location_ids && schedule.location_ids.length > 0) {
          meterQuery = meterQuery.in("location_id", schedule.location_ids);
        }
        if (schedule.energy_types && schedule.energy_types.length > 0) {
          meterQuery = meterQuery.in("energy_type", schedule.energy_types);
        }
        const { data: meters } = await meterQuery;
        const meterIds = (meters ?? []).map((m: any) => m.id);

        // Get locations for labels
        const { data: locations } = await supabase.from("locations").select("id, name").eq("tenant_id", schedule.tenant_id);
        const locMap = new Map((locations ?? []).map((l: any) => [l.id, l.name]));

        // Get readings
        let rows: Record<string, unknown>[] = [];
        if (meterIds.length > 0) {
          const { data: readings } = await supabase
            .from("meter_readings")
            .select("meter_id, value, reading_date, capture_method")
            .in("meter_id", meterIds)
            .gte("reading_date", from)
            .lte("reading_date", to)
            .order("reading_date", { ascending: true });

          rows = (readings ?? []).map((r: any) => {
            const meter = (meters ?? []).find((m: any) => m.id === r.meter_id);
            return {
              Standort: locMap.get(meter?.location_id) || "",
              Zähler: meter?.name || "",
              Zählernummer: meter?.meter_number || "",
              Energieart: ENERGY_LABELS[meter?.energy_type] || meter?.energy_type || "",
              Datum: r.reading_date,
              Wert: r.value,
              Einheit: meter?.unit || "kWh",
            };
          });
        }

        const dateRange = { from, to };
        const reportTitle = `${schedule.name} – ${FREQ_LABELS[schedule.frequency] || schedule.frequency}`;

        // Build attachments
        const attachments: { filename: string; content: string }[] = [];
        if (schedule.format === "csv" || schedule.format === "both") {
          attachments.push({
            filename: `report-${from}-${to}.csv`,
            content: Buffer.from(buildCSV(rows)).toString("base64"),
          });
        }

        // Build email HTML
        const htmlContent = `
          <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
            <h1 style="color:#333;font-size:20px">${reportTitle}</h1>
            <p style="color:#666">Automatischer Energiebericht</p>
            ${schedule.format === "pdf" || schedule.format === "both"
              ? buildHTMLTable(rows, "Verbrauchsdaten", dateRange)
              : `<p>${rows.length} Datensätze im Anhang (CSV)</p>`
            }
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
            <p style="font-size:11px;color:#999">
              Dieser Report wurde automatisch erstellt. Zeitraum: ${from} – ${to}
            </p>
          </div>
        `;

        if (resend && schedule.recipients.length > 0) {
          await resend.emails.send({
            from: "Energiebericht <onboarding@resend.dev>",
            to: schedule.recipients,
            subject: `${reportTitle} (${from} – ${to})`,
            html: htmlContent,
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          });
        }

        // Update last_sent_at and compute next_run_at
        const nextRun = new Date();
        switch (schedule.frequency) {
          case "weekly": nextRun.setDate(nextRun.getDate() + 7); break;
          case "quarterly": nextRun.setMonth(nextRun.getMonth() + 3); break;
          case "yearly": nextRun.setFullYear(nextRun.getFullYear() + 1); break;
          default: nextRun.setMonth(nextRun.getMonth() + 1); break;
        }

        await supabase.from("report_schedules").update({
          last_sent_at: new Date().toISOString(),
          next_run_at: nextRun.toISOString(),
        }).eq("id", schedule.id);

        results.push({ id: schedule.id, success: true });
      } catch (err: any) {
        console.error(`Error processing schedule ${schedule.id}:`, err);
        results.push({ id: schedule.id, success: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-scheduled-report error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
