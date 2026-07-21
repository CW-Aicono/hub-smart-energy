// Charging Reporting: geplanter Versand
// Cron-getriggert. Läuft fällige charging_report_schedules ab, generiert CSV
// über die aktuellen charging_sessions + charging_invoices und verschickt sie
// per Resend an die hinterlegten Empfänger.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

type Frequency = "daily" | "weekly" | "monthly";
type Dimension =
  | "charge_point" | "charge_point_group"
  | "user" | "user_group" | "billing_group"
  | "day" | "week" | "month";
type Metric = "energy_kwh" | "revenue_gross" | "revenue_net" | "sessions" | "duration_h" | "idle_fee";

interface ScheduleConfig {
  dimension?: Dimension;
  metric?: Metric;
  statusFilter?: "all" | "paid" | "open";
  rangeDays?: number; // optional Override
}

const DIM_LABEL: Record<Dimension, string> = {
  charge_point: "Ladepunkt",
  charge_point_group: "Ladepunktgruppe",
  user: "Nutzer",
  user_group: "Nutzergruppe",
  billing_group: "Rechnungsgruppe",
  day: "Tag", week: "Woche", month: "Monat",
};

const METRIC_LABEL: Record<Metric, string> = {
  energy_kwh: "Energie (kWh)",
  revenue_gross: "Umsatz brutto (EUR)",
  revenue_net: "Umsatz netto (EUR)",
  sessions: "Sessions",
  duration_h: "Ladedauer (h)",
  idle_fee: "Standzeit-Gebühr (EUR)",
};

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\n");
}

function periodBounds(freq: Frequency, ref = new Date()): { from: Date; to: Date; label: string } {
  const to = new Date(ref);
  to.setHours(23, 59, 59, 999);
  const from = new Date(ref);
  from.setHours(0, 0, 0, 0);
  if (freq === "daily") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
    return { from, to, label: from.toISOString().slice(0, 10) };
  }
  if (freq === "weekly") {
    from.setDate(from.getDate() - 7);
    return { from, to, label: `${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}` };
  }
  from.setMonth(from.getMonth() - 1);
  return { from, to, label: `${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}` };
}

function nextRun(freq: Frequency, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(6, 15, 0, 0); // 06:15 lokal
  if (freq === "daily") d.setDate(d.getDate() + 1);
  else if (freq === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resend = new Resend(RESEND_KEY);

  // Optional: manueller Testlauf via ?schedule_id=…
  const url = new URL(req.url);
  const scheduleId = url.searchParams.get("schedule_id");

  const query = supabase
    .from("charging_report_schedules")
    .select("*")
    .eq("is_active", true);
  if (scheduleId) query.eq("id", scheduleId);
  else query.or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);

  const { data: schedules, error: sErr } = await query;
  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; status: "sent" | "skipped" | "failed"; message?: string }> = [];

  for (const s of schedules ?? []) {
    try {
      const freq = s.frequency as Frequency;
      const cfg: ScheduleConfig = (s.config as ScheduleConfig) ?? {};
      const { from, to, label } = periodBounds(freq);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      const [sessRes, invRes] = await Promise.all([
        supabase.from("charging_sessions")
          .select("id, charge_point_id, id_tag, start_time, stop_time, energy_kwh, status")
          .eq("tenant_id", s.tenant_id)
          .gte("start_time", fromISO).lte("start_time", toISO),
        supabase.from("charging_invoices")
          .select("id, session_id, user_id, billing_group_id, total_amount, net_amount, idle_fee_amount, status, invoice_date")
          .eq("tenant_id", s.tenant_id)
          .gte("invoice_date", fromISO.slice(0, 10))
          .lte("invoice_date", toISO.slice(0, 10)),
      ]);
      if (sessRes.error) throw sessRes.error;
      if (invRes.error) throw invRes.error;

      const invBySess = new Map<string, { total: number; net: number; idle: number; status?: string; user_id?: string; billing_group_id?: string }>();
      let revGross = 0, revNet = 0, idle = 0;
      for (const inv of invRes.data ?? []) {
        if (inv.session_id) invBySess.set(inv.session_id, {
          total: Number(inv.total_amount ?? 0),
          net: Number(inv.net_amount ?? 0),
          idle: Number(inv.idle_fee_amount ?? 0),
          status: inv.status ?? undefined,
          user_id: inv.user_id ?? undefined,
          billing_group_id: inv.billing_group_id ?? undefined,
        });
        revGross += Number(inv.total_amount ?? 0);
        revNet += Number(inv.net_amount ?? 0);
        idle += Number(inv.idle_fee_amount ?? 0);
      }

      const sessions = (sessRes.data ?? []).filter((row) => {
        if (cfg.statusFilter === "paid") return invBySess.get(row.id)?.status === "paid";
        if (cfg.statusFilter === "open") {
          const inv = invBySess.get(row.id);
          return !inv || inv.status !== "paid";
        }
        return true;
      });

      let energy = 0, durationH = 0;
      for (const r of sessions) {
        energy += Number(r.energy_kwh ?? 0);
        if (r.start_time && r.stop_time) {
          durationH += (new Date(r.stop_time).getTime() - new Date(r.start_time).getTime()) / 3_600_000;
        }
      }

      const dimension: Dimension = cfg.dimension ?? "charge_point";
      const metric: Metric = cfg.metric ?? "revenue_gross";

      // Simpler CSV detail: pro Session eine Zeile
      const detailRows: (string | number)[][] = [
        ["Session-ID", "Ladepunkt-ID", "Start", "Stop", "Energie (kWh)", "Umsatz brutto (EUR)", "Status Session", "Status Rechnung"],
        ...sessions.map((r) => {
          const inv = invBySess.get(r.id);
          return [
            r.id, r.charge_point_id ?? "", r.start_time ?? "", r.stop_time ?? "",
            Number((Number(r.energy_kwh ?? 0)).toFixed(2)),
            Number((inv?.total ?? 0).toFixed(2)),
            r.status ?? "", inv?.status ?? "offen",
          ];
        }),
      ];

      const overviewRows: (string | number)[][] = [
        ["AICONO EMS · Ladeinfrastruktur-Report"],
        ["Zeitraum", label],
        ["Frequenz", freq],
        ["Gruppierung", DIM_LABEL[dimension]],
        ["Metrik", METRIC_LABEL[metric]],
        [],
        ["KPI", "Wert"],
        ["Sessions", sessions.length],
        ["Energie (kWh)", Number(energy.toFixed(2))],
        ["Umsatz brutto (EUR)", Number(revGross.toFixed(2))],
        ["Umsatz netto (EUR)", Number(revNet.toFixed(2))],
        ["Standzeit-Gebühren (EUR)", Number(idle.toFixed(2))],
        ["Ø Ladedauer (h)", sessions.length ? Number((durationH / sessions.length).toFixed(2)) : 0],
        [],
        ["— Detail (pro Session) siehe zweite Datei / weiter unten —"],
      ];

      const overviewCsv = toCsv(overviewRows);
      const detailCsv = toCsv(detailRows);

      const html = `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2 style="margin:0 0 8px 0">Ladeinfrastruktur-Report</h2>
          <p style="margin:0 0 8px 0"><strong>${s.name}</strong></p>
          <p style="margin:0 0 12px 0">Zeitraum: <strong>${label}</strong></p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr><td style="padding:4px 12px 4px 0">Sessions</td><td><strong>${sessions.length}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Energie</td><td><strong>${energy.toFixed(2)} kWh</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Umsatz brutto</td><td><strong>${revGross.toFixed(2)} €</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Umsatz netto</td><td><strong>${revNet.toFixed(2)} €</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Standzeit-Gebühr</td><td><strong>${idle.toFixed(2)} €</strong></td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#64748b">Details siehe angehängte CSV-Dateien.</p>
        </div>
      `;

      if (!s.recipients || s.recipients.length === 0) {
        results.push({ id: s.id, status: "skipped", message: "no recipients" });
      } else {
        const sendRes = await resend.emails.send({
          from: resendFrom("AICONO Reporting"),
          to: s.recipients,
          subject: `Ladeinfrastruktur-Report · ${s.name} · ${label}`,
          html,
          attachments: [
            { filename: `report_${label.replace(/[^0-9-]/g, "_")}_uebersicht.csv`, content: btoa(unescape(encodeURIComponent(overviewCsv))) },
            { filename: `report_${label.replace(/[^0-9-]/g, "_")}_detail.csv`, content: btoa(unescape(encodeURIComponent(detailCsv))) },
          ],
        });
        if ((sendRes as { error?: unknown }).error) throw (sendRes as { error: Error }).error;
        results.push({ id: s.id, status: "sent" });
      }

      await supabase.from("charging_report_schedules").update({
        last_sent_at: new Date().toISOString(),
        next_run_at: nextRun(freq).toISOString(),
        last_error: null,
      }).eq("id", s.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: s.id, status: "failed", message: msg });
      await supabase.from("charging_report_schedules").update({
        last_error: msg,
        next_run_at: nextRun(s.frequency as Frequency).toISOString(),
      }).eq("id", s.id);
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
