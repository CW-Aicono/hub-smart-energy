import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

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

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDateRange(frequency: string, weekStartDay = 1): { from: string; to: string } {
  // All reports cover the PREVIOUS complete period.
  // "now" in MEZ: the cron runs at 05:00 UTC = 06:00 MEZ, so "today" in MEZ is correct.
  const now = new Date();

  switch (frequency) {
    case "daily": {
      // Yesterday
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return { from: toDateStr(yesterday), to: toDateStr(yesterday) };
    }
    case "weekly": {
      // Last full week based on weekStartDay (0=Sun, 1=Mon, ..., 6=Sat)
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const currentDay = today.getDay(); // 0=Sun
      // Days since the most recent weekStartDay
      const daysSinceStart = (currentDay - weekStartDay + 7) % 7;
      // Start of THIS week
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - daysSinceStart);
      // Last week = 7 days before this week start
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
      return { from: toDateStr(lastWeekStart), to: toDateStr(lastWeekEnd) };
    }
    case "monthly": {
      // Previous full month
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfPrevMonth = new Date(firstOfThisMonth);
      lastOfPrevMonth.setDate(0); // last day of previous month
      const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
      return { from: toDateStr(firstOfPrevMonth), to: toDateStr(lastOfPrevMonth) };
    }
    case "quarterly": {
      // Previous full quarter
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const prevQuarterStart = currentQuarter === 0
        ? new Date(now.getFullYear() - 1, 9, 1)  // Q4 of previous year
        : new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
      const prevQuarterEnd = new Date(prevQuarterStart.getFullYear(), prevQuarterStart.getMonth() + 3, 0);
      return { from: toDateStr(prevQuarterStart), to: toDateStr(prevQuarterEnd) };
    }
    case "yearly": {
      // Previous full year
      const prevYear = now.getFullYear() - 1;
      return { from: `${prevYear}-01-01`, to: `${prevYear}-12-31` };
    }
    default: {
      // Fallback: previous month
      const firstOfThisMonth2 = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfPrevMonth2 = new Date(firstOfThisMonth2);
      lastOfPrevMonth2.setDate(0);
      const firstOfPrevMonth2 = new Date(lastOfPrevMonth2.getFullYear(), lastOfPrevMonth2.getMonth(), 1);
      return { from: toDateStr(firstOfPrevMonth2), to: toDateStr(lastOfPrevMonth2) };
    }
  }
}

function buildCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(";");
  const body = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(";")).join("\n");
  return "\uFEFF" + header + "\n" + body;
}

/** Build a PDF document from report data and return base64 string */
function buildPDF(
  rows: Record<string, unknown>[],
  reportTitle: string,
  dateRange: { from: string; to: string },
  tenantName: string,
  energySummary: { label: string; value: number; color: string; icon: string }[],
): string {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // --- Header bar ---
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(reportTitle, margin, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${tenantName ? tenantName + " \u00B7 " : ""}Zeitraum: ${formatDateDE(dateRange.from)} \u2013 ${formatDateDE(dateRange.to)} \u00B7 Erstellt: ${new Date().toLocaleDateString("de-DE")}`,
    margin, 17
  );
  y = 28;

  // --- KPI summary ---
  const totalReadings = rows.length;
  const totalLocations = new Set(rows.map((r) => r["Standort"])).size;
  const totalMeters = new Set(rows.map((r) => r["Z\u00E4hler"])).size;
  const totalEnergy = rows.reduce((s, r) => s + (Number(r["Wert"]) || 0), 0);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const kpis = [
    `Datensaetze: ${totalReadings}`,
    `Standorte: ${totalLocations}`,
    `Zaehler: ${totalMeters}`,
    `Gesamt: ${formatDE(totalEnergy)} kWh`,
  ];
  energySummary.forEach((e) => {
    kpis.push(`${e.label}: ${formatDE(e.value)} kWh`);
  });
  doc.text(kpis.join("   |   "), margin, y);
  y += 7;

  // --- Data table ---
  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Keine Daten im gewaehlten Zeitraum.", margin, y);
  } else {
    const cols = Object.keys(rows[0]);
    const availW = pageW - margin * 2;
    const colW = availW / cols.length;

    const drawTableHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, availW, 7, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      cols.forEach((col, i) => {
        doc.text(col, margin + i * colW + 2, y + 5);
      });
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7);
    };

    drawTableHeader();

    rows.forEach((row, rowIdx) => {
      if (y > pageH - 15) {
        doc.addPage();
        y = margin;
        drawTableHeader();
      }

      if (rowIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, availW, 6, "F");
      }

      cols.forEach((col, i) => {
        let val: unknown = row[col] ?? "";
        if (col === "Datum" && typeof val === "string") val = formatDateDE(val as string);
        if (col === "Wert" && typeof val === "number") val = formatDE(val as number);
        const text = String(val).substring(0, 30);
        doc.text(text, margin + i * colW + 2, y + 3.5);
      });
      y += 6;
    });
  }

  // --- Footer on every page ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${tenantName} | Energiebericht | Seite ${p}/${totalPages}`,
      pageW / 2, pageH - 6,
      { align: "center" }
    );
  }

  // Return as base64
  const pdfOutput = doc.output("arraybuffer");
  const uint8 = new Uint8Array(pdfOutput as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
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
        // (tenant fetched first so weekStartDay is available for getDateRange)

        // Get tenant info (logo, name, branding)
        const { data: tenantData } = await supabase.from("tenants").select("name, logo_url, branding, week_start_day").eq("id", schedule.tenant_id).single();
        const tenantName = tenantData?.name || "";
        const logoUrl = tenantData?.logo_url || null;
        const tenantBranding = (tenantData?.branding as Record<string, string>) || {};
        const primaryColor = tenantBranding.primaryColor || "#1e293b";
        const accentColor = tenantBranding.accentColor || "#334155";
        const weekStartDay: number = tenantData?.week_start_day ?? 1;

        const { from, to } = getDateRange(schedule.frequency, weekStartDay);

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

        // Get data from meter_period_totals (primary: automated daily aggregates)
        // AND meter_readings (secondary: manual/QR/AI readings)
        let rows: Record<string, unknown>[] = [];
        if (meterIds.length > 0) {
          // 1) meter_period_totals – daily aggregates from Loxone/computed
          const { data: periodTotals } = await supabase
            .from("meter_period_totals")
            .select("meter_id, total_value, period_start, source, energy_type")
            .in("meter_id", meterIds)
            .eq("period_type", "day")
            .gte("period_start", from)
            .lte("period_start", to)
            .order("period_start", { ascending: true });

          const periodRows = (periodTotals ?? []).map((r: any) => {
            const meter = (meters ?? []).find((m: any) => m.id === r.meter_id);
            return {
              Quelle: "Messstellen",
              Standort: locMap.get(meter?.location_id) || "",
              Zähler: meter?.name || "",
              Zählernummer: meter?.meter_number || "",
              Energieart: ENERGY_LABELS[r.energy_type] || ENERGY_LABELS[meter?.energy_type] || meter?.energy_type || "",
              Datum: r.period_start,
              Wert: Number(r.total_value) || 0,
              Einheit: meter?.unit || "kWh",
              Erfassung: r.source === "loxone" ? "Automatic" : r.source || "Automatic",
              Name: meter?.name || "",
            };
          });

          // 2) meter_readings – manual/QR/AI readings
          const { data: manualReadings } = await supabase
            .from("meter_readings")
            .select("meter_id, value, reading_date, capture_method")
            .in("meter_id", meterIds)
            .gte("reading_date", from)
            .lte("reading_date", to)
            .order("reading_date", { ascending: true });

          const manualRows = (manualReadings ?? []).map((r: any) => {
            const meter = (meters ?? []).find((m: any) => m.id === r.meter_id);
            const captureLabels: Record<string, string> = { manual: "Manual", qr: "AI-OCR", ai: "AI-OCR", ocr: "AI-OCR" };
            return {
              Quelle: "Zählerablesungen",
              Standort: locMap.get(meter?.location_id) || "",
              Zähler: meter?.name || "",
              Zählernummer: meter?.meter_number || "",
              Energieart: ENERGY_LABELS[meter?.energy_type] || meter?.energy_type || "",
              Datum: r.reading_date,
              Wert: r.value,
              Einheit: meter?.unit || "kWh",
              Erfassung: captureLabels[r.capture_method] || r.capture_method || "Manual",
              Name: meter?.name || "",
            };
          });

          rows = [...manualRows, ...periodRows];
          // Sort by date
          rows.sort((a, b) => String(a.Datum).localeCompare(String(b.Datum)));
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

        // Build attachments (CSV and/or PDF)
        const attachments: { filename: string; content: string }[] = [];
        if (schedule.format === "csv" || schedule.format === "both") {
          attachments.push({
            filename: `report-${from}-${to}.csv`,
            content: btoa(unescape(encodeURIComponent(buildCSV(rows)))),
          });
        }
        if (schedule.format === "pdf" || schedule.format === "both") {
          try {
            const pdfBase64 = buildPDF(rows, reportTitle, dateRange, tenantName, energySummary);
            attachments.push({
              filename: `report-${from}-${to}.pdf`,
              content: pdfBase64,
            });
          } catch (pdfErr: any) {
            console.error("PDF generation failed:", pdfErr);
          }
        }

        if (resend && schedule.recipients.length > 0) {
          await resend.emails.send({
            from: resendFrom(tenantName || "Energiebericht"),
            to: schedule.recipients,
            subject: `${reportTitle} (${formatDateDE(from)} – ${formatDateDE(to)})`,
            html: htmlContent,
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          });
        }

        // Calculate next_run_at based on frequency
        // Reports run at 05:00 UTC (06:00 MEZ) daily; next_run_at determines WHEN a schedule is due
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setUTCHours(5, 0, 0, 0); // 05:00 UTC = 06:00 MEZ

        switch (schedule.frequency) {
          case "daily":
            // Tomorrow at 05:00 UTC
            nextRun.setUTCDate(nextRun.getUTCDate() + 1);
            break;
          case "weekly": {
            // Next weekStartDay at 05:00 UTC
            const currentDay = nextRun.getDay();
            let daysUntilNext = (weekStartDay - currentDay + 7) % 7;
            if (daysUntilNext === 0) daysUntilNext = 7; // always next week
            nextRun.setUTCDate(nextRun.getUTCDate() + daysUntilNext);
            break;
          }
          case "monthly":
            // 1st of next month at 05:00 UTC
            nextRun.setUTCMonth(nextRun.getUTCMonth() + 1, 1);
            break;
          case "quarterly": {
            // 1st of next quarter at 05:00 UTC
            const currentQuarter = Math.floor(nextRun.getUTCMonth() / 3);
            nextRun.setUTCMonth((currentQuarter + 1) * 3, 1);
            break;
          }
          case "yearly":
            // Jan 1st of next year at 05:00 UTC
            nextRun.setUTCFullYear(nextRun.getUTCFullYear() + 1, 0, 1);
            break;
          default:
            nextRun.setUTCMonth(nextRun.getUTCMonth() + 1, 1);
            break;
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
