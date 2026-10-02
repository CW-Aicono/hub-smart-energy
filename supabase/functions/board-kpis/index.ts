import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * board-kpis – Aggregierte Kennzahlen für das C-Level Dashboard.
 *
 * Berechnet Werte ausschließlich aus tatsächlich vorhandenen Datenquellen.
 * Felder ohne Datenbasis liefern `null`; das Frontend zeigt "—".
 *
 * Preisermittlung folgt costCalculations.ts:
 * - Suche energy_prices nach (location_id, energy_type) mit Gültigkeitszeitraum
 * - Fallback: tenant-weiter Preis (location_id IS NULL)
 *
 * CO₂-Faktoren aus co2_emission_factors (tenant-spezifisch oder is_default=true).
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401, corsHeaders);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Nicht authentifiziert" }, 401, corsHeaders);

    const db = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("user_id", userData.user.id).single();
    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: "Kein Mandant zugeordnet" }, 403, corsHeaders);

    const now = new Date();
    const year = now.getUTCFullYear();
    const monthIdx = now.getUTCMonth();
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const todayStr = now.toISOString().slice(0, 10);
    const firstOfMonthStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
    const firstOfYearStr = `${year}-01-01`;
    const lastYearSameDayStr = `${year - 1}-${todayStr.slice(5)}`;
    const lastYearStartStr = `${year - 1}-01-01`;
    const firstOfMonthIso = new Date(Date.UTC(year, monthIdx, 1)).toISOString();
    const firstOfYearIso = new Date(Date.UTC(year, 0, 1)).toISOString();
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Stammdaten parallel
    const [pricesRes, co2Res, locsRes, gwRes, intErrRes, cpsRes] = await Promise.all([
      db.from("energy_prices").select("*").eq("tenant_id", tenantId),
      db.from("co2_emission_factors").select("*").or(`tenant_id.eq.${tenantId},is_default.eq.true`),
      db.from("locations").select("id, name").eq("tenant_id", tenantId),
      db.from("gateway_devices").select("id, last_heartbeat_at, status").eq("tenant_id", tenantId),
      db.from("integration_errors").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("is_resolved", false).eq("is_ignored", false),
      db.from("charge_points").select("id").eq("tenant_id", tenantId),
    ]);
    const prices = (pricesRes.data ?? []) as PriceRow[];
    const co2Factors = (co2Res.data ?? []) as Co2Row[];
    const locations = (locsRes.data ?? []) as Array<{ id: string; name: string }>;
    const gateways = (gwRes.data ?? []) as Array<{ id: string; last_heartbeat_at: string | null }>;

    // ── Meter-Lookup für location/energy-Auflösung
    const { data: metersData } = await db
      .from("meters")
      .select("id, location_id, energy_type")
      .eq("tenant_id", tenantId)
      .eq("is_archived", false);
    const meterMap = new Map<string, { location_id: string | null; energy_type: string | null }>();
    for (const m of metersData ?? []) meterMap.set(m.id as string, m as any);

    // ── meter_period_totals aktuelles Jahr + Vorjahr parallel
    const [ytdRes, lastYtdRes] = await Promise.all([
      db.from("meter_period_totals")
        .select("meter_id, period_type, period_start, total_value, energy_type")
        .eq("tenant_id", tenantId)
        .eq("period_type", "day")
        .gte("period_start", firstOfYearStr)
        .lte("period_start", todayStr),
      db.from("meter_period_totals")
        .select("meter_id, period_type, period_start, total_value, energy_type")
        .eq("tenant_id", tenantId)
        .eq("period_type", "day")
        .gte("period_start", lastYearStartStr)
        .lte("period_start", lastYearSameDayStr),
    ]);
    const ytdRows = (ytdRes.data ?? []) as TotalRow[];
    const lastYtdRows = (lastYtdRes.data ?? []) as TotalRow[];

    // ── Kosten & CO₂ aggregieren
    const sumsPerLocation = new Map<string, number>();
    let cost_today = 0;
    let cost_month = 0;
    let cost_ytd = 0;
    let co2_month_kg = 0;
    let co2_ytd_kg = 0;
    let kwh_month = 0;

    for (const r of ytdRows) {
      const meter = meterMap.get(r.meter_id);
      const locId = meter?.location_id ?? null;
      const etype = (r.energy_type && r.energy_type !== "none" ? r.energy_type : meter?.energy_type) ?? null;
      const kwh = numeric(r.total_value);
      if (!etype) continue;
      const price = etype && locId ? findPrice(prices, locId, etype, r.period_start) : 0;
      const cost = kwh * price;
      const co2 = kwh * findCo2Factor(co2Factors, etype, r.period_start);
      cost_ytd += cost;
      co2_ytd_kg += co2;
      if (r.period_start >= firstOfMonthStr) {
        cost_month += cost;
        co2_month_kg += co2;
        kwh_month += kwh;
        if (locId) sumsPerLocation.set(locId, (sumsPerLocation.get(locId) ?? 0) + cost);
      }
      if (r.period_start === todayStr) cost_today += cost;
    }

    let cost_ytd_lastyear = 0;
    for (const r of lastYtdRows) {
      const meter = meterMap.get(r.meter_id);
      const locId = meter?.location_id ?? null;
      const etype = (r.energy_type && r.energy_type !== "none" ? r.energy_type : meter?.energy_type) ?? null;
      if (!etype || !locId) continue;
      cost_ytd_lastyear += numeric(r.total_value) * findPrice(prices, locId, etype, r.period_start);
    }
    const savings_vs_last_year = cost_ytd_lastyear > 0 ? cost_ytd_lastyear - cost_ytd : null;

    // Forecast: lineare Hochrechnung aus bisherigem Monatswert
    const forecast_eom = dayOfMonth > 0 && cost_month > 0
      ? (cost_month / dayOfMonth) * daysInMonth
      : (cost_month > 0 ? cost_month : null);

    // Top 3 Standorte (Monat)
    const top_locations = [...sumsPerLocation.entries()]
      .map(([id, eur]) => ({
        location_id: id,
        name: locations.find((l) => l.id === id)?.name ?? "—",
        cost_month: eur,
      }))
      .sort((a, b) => b.cost_month - a.cost_month)
      .slice(0, 3);

    // ── PV-Ertrag
    const [pvMonthRes, pvYtdRes] = await Promise.all([
      db.from("pv_actual_hourly").select("actual_kwh").eq("tenant_id", tenantId).gte("hour_start", firstOfMonthIso),
      db.from("pv_actual_hourly").select("actual_kwh").eq("tenant_id", tenantId).gte("hour_start", firstOfYearIso),
    ]);
    const pv_yield_month = sum(pvMonthRes.data, "actual_kwh");
    const pv_yield_ytd = sum(pvYtdRes.data, "actual_kwh");
    const co2_avoided_tons = pv_yield_ytd != null
      ? (pv_yield_ytd * findCo2Factor(co2Factors, "strom", todayStr)) / 1000
      : null;

    // Eigenverbrauchsquote: PV-Ertrag (Monat) / Verbrauch Strom (Monat) — gekappt bei 100 %.
    // Nur belastbar, wenn beide Größen > 0.
    let self_consumption_ratio: number | null = null;
    let self_sufficiency: number | null = null;
    let stromMonthKwh = 0;
    for (const r of ytdRows) {
      if (r.period_start < firstOfMonthStr) continue;
      const meter = meterMap.get(r.meter_id);
      const etype = (r.energy_type && r.energy_type !== "none" ? r.energy_type : meter?.energy_type) ?? null;
      if (etype === "strom") stromMonthKwh += numeric(r.total_value);
    }
    if (pv_yield_month != null && pv_yield_month > 0 && stromMonthKwh > 0) {
      // Autarkie: Anteil PV am Gesamtverbrauch (PV + Netz). meter_period_totals zählt Netzbezug.
      const totalConsumption = stromMonthKwh + pv_yield_month;
      self_sufficiency = Math.min(100, (pv_yield_month / totalConsumption) * 100);
      // Eigenverbrauchsquote = PV genutzt / PV erzeugt. Ohne Einspeise-Messung als
      // Näherung: angenommen alle PV-kWh, die Bezug ersetzen, gehen ins Eigenverbrauch.
      self_consumption_ratio = Math.min(100, (pv_yield_month / (pv_yield_month + 1)) * 100);
      // Da keine Einspeise-Daten vorliegen, setzen wir Eigenverbrauchsquote lieber auf null,
      // damit kein Pseudo-Wert kommuniziert wird.
      self_consumption_ratio = null;
    }

    // ── Aufgaben
    const [tasksOpenRes, tasksOverdueRes] = await Promise.all([
      db.from("tasks").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).not("status", "in", "(done,closed,resolved)"),
      db.from("tasks").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).not("status", "in", "(done,closed,resolved)").lt("due_date", todayStr),
    ]);
    const tasks_open = tasksOpenRes.count ?? 0;
    const tasks_overdue = tasksOverdueRes.count ?? 0;

    // ── Trading-P&L
    const tradingRes = await db.from("arbitrage_trades")
      .select("revenue_eur").eq("tenant_id", tenantId).gte("timestamp", firstOfMonthIso);
    const trading_pnl_month = sum(tradingRes.data, "revenue_eur");

    // ── Lade-Sessions
    const chargingRes = await db.from("charging_sessions")
      .select("energy_kwh").eq("tenant_id", tenantId).gte("start_time", firstOfMonthIso);
    const charging_kwh_month = sum(chargingRes.data, "energy_kwh");

    // ── Offene Rechnungen
    const invoicesRes = await db.from("tenant_electricity_invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).neq("status", "paid");
    const invoices_open = invoicesRes.count ?? 0;

    // ── Ladepunkt-Stabilität (% online, 30 Tage)
    let cp_stability: number | null = null;
    const cps = (cpsRes.data ?? []) as Array<{ id: string }>;
    if (cps.length) {
      const ids = cps.map((c) => c.id);
      const { data: snaps } = await db.from("charge_point_uptime_snapshots")
        .select("is_online").in("charge_point_id", ids).gte("recorded_at", thirtyDaysAgoIso);
      if (snaps && snaps.length) {
        const online = (snaps as Array<{ is_online: boolean }>).filter((s) => s.is_online).length;
        cp_stability = (online / snaps.length) * 100;
      }
    }

    // ── Gateway-Verfügbarkeit (3-min-Heartbeat-Regel)
    let gateway_availability: number | null = null;
    if (gateways.length) {
      const threshold = Date.now() - 3 * 60 * 1000;
      const online = gateways.filter((g) =>
        g.last_heartbeat_at && new Date(g.last_heartbeat_at).getTime() >= threshold
      ).length;
      gateway_availability = (online / gateways.length) * 100;
    }

    return json({
      generated_at: now.toISOString(),
      kpis: {
        cost_today: nullIfZero(cost_today, ytdRows.length),
        cost_month: nullIfZero(cost_month, ytdRows.length),
        cost_ytd: nullIfZero(cost_ytd, ytdRows.length),
        savings_vs_last_year,
        forecast_eom,
        co2_month: nullIfZero(co2_month_kg / 1000, ytdRows.length), // Tonnen
        co2_ytd: nullIfZero(co2_ytd_kg / 1000, ytdRows.length),
        co2_avoided_tons,
        self_consumption_ratio,
        self_sufficiency,
        pv_yield_month,
        pv_yield_ytd,
        top_locations,
        alerts_open: intErrRes.count ?? 0,
        gateway_availability,
        cp_stability,
        tasks_open,
        tasks_overdue,
        trading_pnl_month,
        charging_kwh_month,
        invoices_open,
      },
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[board-kpis] error", e);
    return json({ error: "Interner Fehler", detail: String(e) }, 500, getCorsHeaders(req));
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────

interface PriceRow {
  location_id: string | null;
  tenant_id: string | null;
  energy_type: string;
  price_per_unit: number;
  valid_from: string;
  valid_until: string | null;
}
interface Co2Row {
  tenant_id: string | null;
  energy_type: string;
  factor_kg_per_kwh: number | null;
  valid_from: string;
  valid_until: string | null;
  is_default: boolean;
}
interface TotalRow {
  meter_id: string;
  period_type: string;
  period_start: string;
  total_value: number | string;
  energy_type: string | null;
}

function findPrice(prices: PriceRow[], locId: string, etype: string, dateStr: string): number {
  const matches = prices.filter((p) =>
    p.energy_type === etype &&
    p.valid_from <= dateStr &&
    (!p.valid_until || p.valid_until >= dateStr)
  );
  // Prefer location-specific
  const loc = matches.filter((p) => p.location_id === locId);
  const list = loc.length ? loc : matches.filter((p) => p.location_id === null);
  if (!list.length) return 0;
  return list.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0].price_per_unit;
}

function findCo2Factor(rows: Co2Row[], etype: string, dateStr: string): number {
  const matches = rows.filter((r) =>
    r.energy_type === etype &&
    r.valid_from <= dateStr &&
    (!r.valid_until || r.valid_until >= dateStr)
  );
  if (!matches.length) {
    // Konservativer Default deutscher Strommix bei fehlendem Tenant-Faktor
    return etype === "strom" ? 0.4 : etype === "gas" ? 0.2 : 0;
  }
  // Tenant-spezifisch bevorzugen
  const tenantSpecific = matches.filter((r) => r.tenant_id !== null);
  return Number((tenantSpecific[0] ?? matches[0]).factor_kg_per_kwh ?? 0);
}

function numeric(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}
function sum(rows: Array<Record<string, unknown>> | null, key: string): number | null {
  if (!rows || rows.length === 0) return 0;
  let t = 0;
  for (const r of rows) t += numeric(r[key]);
  return t;
}
function nullIfZero(v: number, sourceRows: number): number | null {
  // Wenn keine Quelldaten existieren, null zurückgeben (Frontend zeigt "—")
  if (sourceRows === 0) return null;
  return v;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, "Content-Type": "application/json" },
  });
}
