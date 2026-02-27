import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom", gas: "Gas", waerme: "Wärme", wasser: "Wasser",
};
const ENERGY_COLORS: Record<string, string> = {
  strom: "#f59e0b", gas: "#3b82f6", waerme: "#ef4444", wasser: "#06b6d4",
};
const ENERGY_ICONS: Record<string, string> = {
  strom: "⚡", gas: "🔥", waerme: "🌡️", wasser: "💧",
};
const FREQ_LABELS: Record<string, string> = {
  daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich", quarterly: "Quartalsweise", yearly: "Jährlich",
};

function getDateRange(frequency: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from: Date;
  switch (frequency) {
    case "daily": from = new Date(now); from.setDate(now.getDate() - 1); break;
    case "weekly": from = new Date(now); from.setDate(now.getDate() - 7); break;
    case "quarterly": from = new Date(now); from.setMonth(now.getMonth() - 3); break;
    case "yearly": from = new Date(now); from.setFullYear(now.getFullYear() - 1); break;
    default: from = new Date(now); from.setMonth(now.getMonth() - 1); break;
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

function formatDE(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function formatDateDE(d: string): string {
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

/** Build SVG bar chart for energy breakdown */
function buildBarChartSVG(data: { label: string; value: number; color: string }[]): string {
  if (!data.length) return "";
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 60;
  const gap = 20;
  const chartHeight = 160;
  const chartWidth = data.length * (barWidth + gap) + gap;

  const bars = data.map((d, i) => {
    const barH = (d.value / maxVal) * (chartHeight - 30);
    const x = gap + i * (barWidth + gap);
    const y = chartHeight - barH - 25;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${d.color}" opacity="0.85"/>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#333" font-weight="600">${formatDE(d.value)}</text>
      <text x="${x + barWidth / 2}" y="${chartHeight - 6}" text-anchor="middle" font-size="10" fill="#666">${d.label}</text>
    `;
  }).join("");

  return `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">${bars}</svg>`;
}

/** Build SVG donut chart for distribution */
function buildDonutSVG(data: { label: string; value: number; color: string }[]): string {
  if (!data.length) return "";
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return "";
  const cx = 80, cy = 80, r = 60, r2 = 35;
  let cumAngle = -90;

  const slices = data.map((d) => {
    const pct = d.value / total;
    const angle = pct * 360;
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad = ((cumAngle + angle) * Math.PI) / 180;
    cumAngle += angle;
    const large = angle > 180 ? 1 : 0;
    const x1o = cx + r * Math.cos(startRad), y1o = cy + r * Math.sin(startRad);
    const x2o = cx + r * Math.cos(endRad), y2o = cy + r * Math.sin(endRad);
    const x1i = cx + r2 * Math.cos(endRad), y1i = cy + r2 * Math.sin(endRad);
    const x2i = cx + r2 * Math.cos(startRad), y2i = cy + r2 * Math.sin(startRad);
    return `<path d="M${x1o},${y1o} A${r},${r} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${r2},${r2} 0 ${large} 0 ${x2i},${y2i}Z" fill="${d.color}" opacity="0.85"/>`;
  }).join("");

  const legend = data.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(1);
    return `<g transform="translate(175, ${i * 24 + 20})">
      <rect width="14" height="14" rx="3" fill="${d.color}" opacity="0.85"/>
      <text x="20" y="11" font-size="11" fill="#333">${d.label}: ${pct}%</text>
    </g>`;
  }).join("");

  return `<svg width="340" height="${Math.max(160, data.length * 24 + 40)}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
    ${slices}
    <circle cx="${cx}" cy="${cy}" r="${r2 - 5}" fill="white"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" fill="#333" font-weight="700">${formatDE(total)}</text>
    ${legend}
  </svg>`;
}

function buildReportHTML(
  rows: Record<string, unknown>[],
  reportTitle: string,
  dateRange: { from: string; to: string },
  tenantName: string,
  logoUrl: string | null,
  energySummary: { label: string; value: number; color: string; icon: string }[],
  locationSummary: { name: string; count: number }[],
  primaryColor = "#1e293b",
  accentColor = "#334155",
): string {
  // KPI cards
  const totalReadings = rows.length;
  const totalLocations = new Set(rows.map((r) => r["Standort"])).size;
  const totalMeters = new Set(rows.map((r) => r["Zähler"])).size;

  const kpiCards = [
    { label: "Ablesungen", value: formatDE(totalReadings), icon: "📊" },
    { label: "Standorte", value: formatDE(totalLocations), icon: "🏢" },
    { label: "Zähler", value: formatDE(totalMeters), icon: "⚙️" },
  ].map((kpi) => `
    <td style="padding:8px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">${kpi.icon}</div>
        <div style="font-size:24px;font-weight:700;color:#1e293b">${kpi.value}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${kpi.label}</div>
      </div>
    </td>
  `).join("");

  // Data table
  let tableHTML = "";
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    const thCells = keys.map((k) => `<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">${k}</th>`).join("");
    const tbRows = rows.map((r, i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return "<tr>" + keys.map((k) => {
        let val = r[k] ?? "";
        if (k === "Datum" && typeof val === "string") val = formatDateDE(val as string);
        if (k === "Wert" && typeof val === "number") val = formatDE(val as number);
        return `<td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${val}</td>`;
      }).join("") + "</tr>";
    }).join("");
    tableHTML = `
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <thead><tr>${thCells}</tr></thead>
        <tbody>${tbRows}</tbody>
      </table>
    `;
  } else {
    tableHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">Keine Daten im gewählten Zeitraum</div>`;
  }

  // Charts
  const barChart = energySummary.length > 0 ? buildBarChartSVG(energySummary) : "";
  const donutChart = energySummary.length > 0 ? buildDonutSVG(energySummary) : "";

  // Location breakdown
  let locationBreakdown = "";
  if (locationSummary.length > 0) {
    const maxCount = Math.max(...locationSummary.map((l) => l.count), 1);
    locationBreakdown = locationSummary.map((l) => {
      const pct = Math.round((l.count / maxCount) * 100);
      return `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
            <span style="color:#334155;font-weight:500">${l.name}</span>
            <span style="color:#64748b">${l.count} Ablesungen</span>
          </div>
          <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
            <div style="background:linear-gradient(90deg,#3b82f6,#06b6d4);width:${pct}%;height:100%;border-radius:4px"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  const logoImgTag = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;border-radius:6px" />`
    : "";

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>${reportTitle}</title>
  <style>
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      @page { margin: 12mm 15mm; size: A4; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 32px; }
  </style>
</head>
<body>
<div class="container">

  <!-- Header / Title bar with Logo -->
  <table style="width:100%;background:linear-gradient(135deg,${primaryColor || '#1e293b'} 0%,${accentColor || '#334155'} 100%);border-radius:12px;margin-bottom:24px;border-spacing:0">
    <tr>
      <td style="padding:24px 28px;vertical-align:middle">
        <div style="font-size:22px;font-weight:700;color:white;margin-bottom:4px">${reportTitle}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7)">${tenantName ? tenantName + " · " : ""}Erstellt am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })} · Zeitraum: ${formatDateDE(dateRange.from)} – ${formatDateDE(dateRange.to)}</div>
      </td>
      ${logoImgTag ? `<td style="padding:24px 28px;vertical-align:middle;text-align:right">${logoImgTag}</td>` : ""}
    </tr>
  </table>

  <!-- KPI Cards -->
  <table style="width:100%;margin-bottom:24px;border-spacing:8px;border-collapse:separate">
    <tr>${kpiCards}</tr>
  </table>

  <!-- Charts Section -->
  ${energySummary.length > 1 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Verbrauch nach Energieart</div>
    <table style="width:100%">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:16px">
          ${barChart}
        </td>
        <td style="width:45%;vertical-align:top">
          ${donutChart}
        </td>
      </tr>
    </table>
  </div>
  ` : ""}

  <!-- Location Breakdown -->
  ${locationBreakdown ? `
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Verteilung nach Standort</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px">
      ${locationBreakdown}
    </div>
  </div>
  ` : ""}

  <!-- Data Table -->
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Detaildaten</div>
    ${tableHTML}
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">
      ${tenantName ? tenantName + " · " : ""}Energiebericht · Erstellt am ${new Date().toLocaleDateString("de-DE")} · ${totalReadings} Datensätze
    </div>
  </div>

  <!-- Print Button (hidden in print) -->
  <div class="no-print" style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="background:#1e293b;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">
      Als PDF drucken
    </button>
  </div>

</div>
</body>
</html>`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = resendKey ? new Resend(resendKey) : null;

    let scheduleIds: string[] = [];
    try {
      const body = await req.json();
      if (body.schedule_id) scheduleIds = [body.schedule_id];
    } catch { /* no body = cron run */ }

    let query = supabase.from("report_schedules").select("*").eq("is_active", true);
    if (scheduleIds.length > 0) {
      query = query.in("id", scheduleIds);
    } else {
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

        // Get tenant info (logo, name, branding)
        const { data: tenantData } = await supabase.from("tenants").select("name, logo_url, branding").eq("id", schedule.tenant_id).single();
        const tenantName = tenantData?.name || "";
        const logoUrl = tenantData?.logo_url || null;
        const tenantBranding = (tenantData?.branding as Record<string, string>) || {};
        const primaryColor = tenantBranding.primaryColor || "#1e293b";
        const accentColor = tenantBranding.accentColor || "#334155";

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

        // Get locations
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

        // Build energy summary for charts
        const energySummary: { label: string; value: number; color: string; icon: string }[] = [];
        const energyTotals = new Map<string, number>();
        rows.forEach((r) => {
          const type = String(r["Energieart"]);
          energyTotals.set(type, (energyTotals.get(type) || 0) + (Number(r["Wert"]) || 0));
        });
        for (const [type, total] of energyTotals) {
          const key = Object.entries(ENERGY_LABELS).find(([_, v]) => v === type)?.[0] || "";
          energySummary.push({
            label: type,
            value: total,
            color: ENERGY_COLORS[key] || "#94a3b8",
            icon: ENERGY_ICONS[key] || "📊",
          });
        }

        // Build location summary
        const locCounts = new Map<string, number>();
        rows.forEach((r) => {
          const loc = String(r["Standort"]);
          if (loc) locCounts.set(loc, (locCounts.get(loc) || 0) + 1);
        });
        const locationSummary = Array.from(locCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        // Build HTML report
        const htmlContent = buildReportHTML(rows, reportTitle, dateRange, tenantName, logoUrl, energySummary, locationSummary, primaryColor, accentColor);

        // Build CSV attachment
        const attachments: { filename: string; content: string }[] = [];
        if (schedule.format === "csv" || schedule.format === "both") {
          attachments.push({
            filename: `report-${from}-${to}.csv`,
            content: btoa(unescape(encodeURIComponent(buildCSV(rows)))),
          });
        }

        if (resend && schedule.recipients.length > 0) {
          await resend.emails.send({
            from: `${tenantName || "Energiebericht"} <noreply@mailtest.my-ips.de>`,
            to: schedule.recipients,
            subject: `${reportTitle} (${formatDateDE(from)} – ${formatDateDE(to)})`,
            html: htmlContent,
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          });
        }

        // Update timestamps
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
