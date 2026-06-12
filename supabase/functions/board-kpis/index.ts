import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * board-kpis – Aggregierte Kennzahlen für das C-Level Dashboard.
 *
 * Liefert die KPIs für den aktuellen Tenant.
 * Berechnet werden nur Werte, deren Quelldaten zuverlässig vorhanden sind.
 * Felder ohne Datenbasis liefern `null`; das Frontend zeigt dann "—".
 *
 * Phase-3-Umfang: PV-Ertrag, CO₂-Einsparung (Default-Faktor 0,4 kg/kWh),
 * Aufgaben (offen/überfällig), Trading-P&L, Ladepunkt-Stabilität,
 * offene Lade-/Mieter-Rechnungen, geladene kWh im Monat.
 *
 * verify_jwt bleibt false (Lovable-Default), Auth wird in Code geprüft.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Nicht authentifiziert" }, 401, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Nicht authentifiziert" }, 401, corsHeaders);
    }

    const db = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await db
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userData.user.id)
      .single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return json({ error: "Kein Mandant zugeordnet" }, 403, corsHeaders);
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const firstOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // PV-Ertrag (kWh)
    const [pvMonthRes, pvYtdRes] = await Promise.all([
      db.from("pv_actual_hourly").select("actual_kwh").eq("tenant_id", tenantId).gte("hour_start", firstOfMonth),
      db.from("pv_actual_hourly").select("actual_kwh").eq("tenant_id", tenantId).gte("hour_start", firstOfYear),
    ]);
    const pv_yield_month = sum(pvMonthRes.data, "actual_kwh");
    const pv_yield_ytd = sum(pvYtdRes.data, "actual_kwh");
    // CO₂-Einsparung (kg) – konservativer Default 0,4 kg/kWh dt. Strommix
    const co2_avoided_tons = pv_yield_ytd != null ? (pv_yield_ytd * 0.4) / 1000 : null;

    // Aufgaben
    const [tasksOpenRes, tasksOverdueRes] = await Promise.all([
      db.from("tasks").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).not("status", "in", "(done,closed,resolved)"),
      db.from("tasks").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("status", "in", "(done,closed,resolved)")
        .lt("due_date", todayStr),
    ]);
    const tasks_open = tasksOpenRes.count ?? 0;
    const tasks_overdue = tasksOverdueRes.count ?? 0;

    // Trading-P&L (€) Monat
    const tradingRes = await db
      .from("arbitrage_trades")
      .select("revenue_eur")
      .eq("tenant_id", tenantId)
      .gte("timestamp", firstOfMonth);
    const trading_pnl_month = sum(tradingRes.data, "revenue_eur");

    // Lade-Sessions Monat (kWh)
    const chargingRes = await db
      .from("charging_sessions")
      .select("energy_kwh")
      .eq("tenant_id", tenantId)
      .gte("start_time", firstOfMonth);
    const charging_kwh_month = sum(chargingRes.data, "energy_kwh");

    // Offene Rechnungen (Mieterstrom)
    const invoicesRes = await db
      .from("tenant_electricity_invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "paid");
    const invoices_open = invoicesRes.count ?? 0;

    // Ladepunkt-Stabilität (% online, 30 Tage)
    let cp_stability: number | null = null;
    const { data: cps } = await db
      .from("charge_points")
      .select("id")
      .eq("tenant_id", tenantId);
    if (cps && cps.length) {
      const ids = cps.map((c: { id: string }) => c.id);
      const { data: snaps } = await db
        .from("charge_point_uptime_snapshots")
        .select("is_online")
        .in("charge_point_id", ids)
        .gte("recorded_at", thirtyDaysAgo);
      if (snaps && snaps.length) {
        const online = snaps.filter((s: { is_online: boolean }) => s.is_online).length;
        cp_stability = (online / snaps.length) * 100;
      }
    }

    return json({
      generated_at: now.toISOString(),
      kpis: {
        pv_yield_month,
        pv_yield_ytd,
        co2_avoided_tons,
        tasks_open,
        tasks_overdue,
        trading_pnl_month,
        charging_kwh_month,
        invoices_open,
        cp_stability,
      },
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[board-kpis] error", e);
    return json({ error: "Interner Fehler", detail: String(e) }, 500, getCorsHeaders(req));
  }
});

function sum(rows: Array<Record<string, unknown>> | null, key: string): number | null {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number") total += v;
    else if (typeof v === "string") total += parseFloat(v) || 0;
  }
  return total;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
