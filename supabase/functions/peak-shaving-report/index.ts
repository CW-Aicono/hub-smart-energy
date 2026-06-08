// Peak-Shaving Report — PDF-Generierung (On-Demand & monatlich automatisch)
//
// Modes:
//  - POST { mode: "ondemand", config_id, year, month } → returns base64 PDF
//  - POST { mode: "monthly_cron" } → versendet PDF an alle Configs mit report_enabled=true
//
// Wird per pg_cron am 1. jedes Monats um 06:00 UTC aufgerufen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";
import { jsPDF } from "npm:jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const fmtEur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtNum = (n: number, d = 1) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

interface ReportData {
  tenantName: string;
  locationName: string;
  configName: string;
  peakLimitKw: number;
  networkTariff: number;
  year: number;
  month: number;
  totalEurSaved: number;
  totalKwhDischarged: number;
  maxPeakKw: number;
  baselinePeakKw: number;
  eventCount: number;
  events: Array<{ started_at: string; ended_at: string | null; peak_actual: number; peak_baseline: number; kwh: number; eur: number }>;
}

async function loadReportData(configId: string, year: number, month: number): Promise<ReportData | null> {
  const { data: cfg } = await admin
    .from("peak_shaving_configs")
    .select("*, locations(name), tenants(name)")
    .eq("id", configId)
    .maybeSingle();
  if (!cfg) return null;

  const { data: summary } = await admin
    .from("peak_shaving_monthly_summary")
    .select("*")
    .eq("config_id", configId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const { data: events } = await admin
    .from("peak_shaving_events")
    .select("started_at, ended_at, peak_kw_actual, peak_kw_without_shaving, kwh_discharged, eur_saved")
    .eq("config_id", configId)
    .gte("started_at", monthStart.toISOString())
    .lt("started_at", monthEnd.toISOString())
    .order("started_at", { ascending: true });

  return {
    tenantName: (cfg as any).tenants?.name ?? "—",
    locationName: (cfg as any).locations?.name ?? "—",
    configName: `Konfiguration ${cfg.id.slice(0, 8)}`,
    peakLimitKw: Number(cfg.peak_limit_kw),
    networkTariff: Number(cfg.network_tariff_eur_per_kw_year),
    year,
    month,
    totalEurSaved: Number(summary?.total_eur_saved ?? 0),
    totalKwhDischarged: Number(summary?.total_kwh_discharged ?? 0),
    maxPeakKw: Number(summary?.max_peak_kw ?? 0),
    baselinePeakKw: Number(summary?.baseline_peak_kw ?? 0),
    eventCount: Number(summary?.event_count ?? 0),
    events: (events ?? []).map((e: any) => ({
      started_at: e.started_at,
      ended_at: e.ended_at,
      peak_actual: Number(e.peak_kw_actual ?? 0),
      peak_baseline: Number(e.peak_kw_without_shaving ?? 0),
      kwh: Number(e.kwh_discharged),
      eur: Number(e.eur_saved),
    })),
  };
}

function buildPdf(data: ReportData): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(20, 90, 175);
  doc.text("Peak-Shaving Monatsbericht", 14, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`${MONTH_NAMES[data.month - 1]} ${data.year}`, 14, y);
  y += 6;
  doc.text(`${data.tenantName} · ${data.locationName}`, 14, y);
  y += 10;

  // KPI Box
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(245, 248, 252);
  doc.roundedRect(14, y, w - 28, 32, 2, 2, "FD");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Eingesparte Netzentgelte", 18, y + 7);
  doc.setFontSize(22);
  doc.setTextColor(20, 90, 175);
  doc.text(fmtEur(data.totalEurSaved), 18, y + 18);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Berechnet aus ${fmtNum(Math.max(0, data.baselinePeakKw - data.maxPeakKw), 1)} kW Spitzen-Reduktion × ${fmtEur(data.networkTariff)}/kW/Jahr ÷ 12`, 18, y + 26);
  y += 38;

  // Detail-KPIs
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const kpis: Array<[string, string]> = [
    ["Höchste Spitze (gemessen)", `${fmtNum(data.maxPeakKw)} kW`],
    ["Höchste Spitze ohne Shaving", `${fmtNum(data.baselinePeakKw)} kW`],
    ["Peak-Limit konfiguriert", `${fmtNum(data.peakLimitKw, 0)} kW`],
    ["Entladene Energie", `${fmtNum(data.totalKwhDischarged, 0)} kWh`],
    ["Anzahl Eingriffe", `${data.eventCount}`],
  ];
  for (const [k, v] of kpis) {
    doc.text(k, 18, y);
    doc.text(v, w - 18, y, { align: "right" });
    y += 6;
  }
  y += 4;

  // Tabelle Eingriffe
  doc.setFontSize(12);
  doc.setTextColor(20, 90, 175);
  doc.text("Eingriffs-Historie", 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFillColor(235, 240, 248);
  doc.rect(14, y - 4, w - 28, 6, "F");
  doc.text("Datum/Zeit", 16, y);
  doc.text("Spitze (kW)", 70, y);
  doc.text("Ohne Sh. (kW)", 100, y);
  doc.text("kWh", 135, y);
  doc.text("Ersparnis", w - 18, y, { align: "right" });
  y += 4;

  doc.setTextColor(40, 40, 40);
  const maxRows = data.events.length;
  for (let i = 0; i < maxRows; i++) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    const ev = data.events[i];
    const d = new Date(ev.started_at);
    const dateStr = `${d.getUTCDate().toString().padStart(2,"0")}.${(d.getUTCMonth()+1).toString().padStart(2,"0")}. ${d.getUTCHours().toString().padStart(2,"0")}:${d.getUTCMinutes().toString().padStart(2,"0")}`;
    y += 5;
    doc.text(dateStr, 16, y);
    doc.text(fmtNum(ev.peak_actual), 70, y);
    doc.text(fmtNum(ev.peak_baseline), 100, y);
    doc.text(fmtNum(ev.kwh, 2), 135, y);
    doc.text(fmtEur(ev.eur), w - 18, y, { align: "right" });
  }

  if (data.events.length === 0) {
    y += 8;
    doc.setTextColor(120, 120, 120);
    doc.text("Keine Eingriffe in diesem Monat.", 16, y);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Erstellt am ${new Date().toLocaleDateString("de-DE")} · AICONO EMS Peak-Shaving`, 14, 290);

  return doc.output("datauristring").split(",")[1]; // base64 ohne Prefix
}

async function sendReportEmail(to: string[], data: ReportData, pdfBase64: string) {
  const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
  const filename = `peak-shaving-${data.year}-${String(data.month).padStart(2, "0")}.pdf`;
  await resend.emails.send({
    from: "AICONO EMS <reports@aicono.org>",
    to,
    subject: `Peak-Shaving Bericht ${MONTH_NAMES[data.month - 1]} ${data.year} — ${fmtEur(data.totalEurSaved)} gespart`,
    html: `
      <h2 style="color:#145AAF;">Ihr Peak-Shaving Monatsbericht</h2>
      <p>Im ${MONTH_NAMES[data.month - 1]} ${data.year} konnten <strong>${fmtEur(data.totalEurSaved)}</strong> an Netzentgelten eingespart werden.</p>
      <ul>
        <li>Anzahl Eingriffe: <strong>${data.eventCount}</strong></li>
        <li>Höchste Spitze: <strong>${fmtNum(data.maxPeakKw)} kW</strong> (ohne Shaving wären es <strong>${fmtNum(data.baselinePeakKw)} kW</strong> gewesen)</li>
        <li>Entladene Energie: <strong>${fmtNum(data.totalKwhDischarged, 0)} kWh</strong></li>
      </ul>
      <p>Den vollständigen Bericht finden Sie als PDF im Anhang.</p>
    `,
    attachments: [{ filename, content: pdfBase64 }],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "ondemand";

    if (mode === "ondemand") {
      const { config_id, year, month } = body;
      if (!config_id || !year || !month) {
        return new Response(JSON.stringify({ ok: false, error: "config_id, year, month required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await loadReportData(config_id, Number(year), Number(month));
      if (!data) {
        return new Response(JSON.stringify({ ok: false, error: "config not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pdf = buildPdf(data);
      return new Response(JSON.stringify({ ok: true, pdf_base64: pdf, filename: `peak-shaving-${year}-${String(month).padStart(2,"0")}.pdf` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "monthly_cron") {
      // Vormonat
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = prev.getFullYear();
      const month = prev.getMonth() + 1;

      const { data: cfgs } = await admin
        .from("peak_shaving_configs")
        .select("id, report_recipients")
        .eq("report_enabled", true)
        .eq("active", true);

      const sent: string[] = [];
      const errors: string[] = [];
      for (const c of cfgs ?? []) {
        try {
          const recipients = (c.report_recipients as string[]) ?? [];
          if (recipients.length === 0) continue;
          const data = await loadReportData(c.id, year, month);
          if (!data) continue;
          const pdf = buildPdf(data);
          await sendReportEmail(recipients, data, pdf);
          sent.push(c.id);
        } catch (e) {
          errors.push(`${c.id}: ${(e as Error).message}`);
        }
      }
      return new Response(JSON.stringify({ ok: true, sent, errors, year, month }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[peak-shaving-report] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
