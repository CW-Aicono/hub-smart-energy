// loxone-parameter-push
// Sammelt Push-Werte aus verschiedenen Cloud-Quellen (Arbitrage-Strategien,
// Peak-Event-Kalender, Community-Allocations, CO2-Prognosen) und legt sie in
// loxone_pending_writes ab. Der WS-Worker holt die Einträge alle paar Sekunden
// via gateway-ingest (Actions list-pending-writes / ack-pending-write) ab und
// schreibt sie über die bestehende Loxone-Remote-Connect-Verbindung.
//
// Aufruf: entweder per Cron (pg_cron -> net.http_post) oder manuell.
// Optionaler Body {"tenant_id": "..."} beschränkt die Verarbeitung auf einen
// Mandanten; ohne Body werden alle aktiven Loxone-Integrationen verarbeitet.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface PendingWriteInsert {
  tenant_id: string;
  location_integration_id: string;
  template_key: string;
  instance: number;
  parameter: string;
  value_num?: number | null;
  value_bool?: boolean | null;
  priority?: number;
  source: string;
  expires_at?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);

  const stats = { arbitrage: 0, peakEvents: 0, community: 0, co2: 0, errors: [] as string[] };
  let scopeTenantId: string | null = null;

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.tenant_id) scopeTenantId = String(body.tenant_id);
    }

    // Aktive Loxone-Integrationen mit gemapptem Template-Katalog laden
    const intQuery = sb
      .from("location_integrations")
      .select("id, tenant_id, integration:integrations(type)")
      .eq("is_active", true);
    if (scopeTenantId) intQuery.eq("tenant_id", scopeTenantId);
    const { data: integrations, error: intErr } = await intQuery;
    if (intErr) throw intErr;
    const loxoneIntegrations = (integrations ?? []).filter(
      (i: any) => i.integration?.type === "loxone_miniserver",
    );
    if (loxoneIntegrations.length === 0) {
      return json(corsHeaders, { success: true, message: "Keine aktiven Loxone-Integrationen", stats });
    }

    for (const li of loxoneIntegrations) {
      const writes: PendingWriteInsert[] = [];
      const nowIso = new Date().toISOString();

      // 1) Arbitrage-Strategien (aktives Fenster) → AICO_ArbitrageDispatch
      try {
        const { data: strat } = await sb
          .from("arbitrage_strategies")
          .select("id, target_power_kw, mode, min_soc_pct, max_soc_pct, price_threshold_ct, active_from, active_until")
          .eq("tenant_id", li.tenant_id)
          .lte("active_from", nowIso)
          .gte("active_until", nowIso)
          .order("active_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (strat) {
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_ArbitrageDispatch", instance: 1, parameter: "TargetPowerKw", value_num: Number(strat.target_power_kw ?? 0), source: "cron:arbitrage", priority: 3 });
          const modeMap: Record<string, number> = { idle: 0, charge: 1, discharge: 2, hold: 3 };
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_ArbitrageDispatch", instance: 1, parameter: "Mode", value_num: modeMap[String(strat.mode ?? "idle").toLowerCase()] ?? 0, source: "cron:arbitrage", priority: 3 });
          if (strat.min_soc_pct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_ArbitrageDispatch", instance: 1, parameter: "MinSocPct", value_num: Number(strat.min_soc_pct), source: "cron:arbitrage" });
          if (strat.max_soc_pct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_ArbitrageDispatch", instance: 1, parameter: "MaxSocPct", value_num: Number(strat.max_soc_pct), source: "cron:arbitrage" });
          if (strat.price_threshold_ct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_ArbitrageDispatch", instance: 1, parameter: "PriceThresholdCt", value_num: Number(strat.price_threshold_ct), source: "cron:arbitrage" });
          stats.arbitrage++;
        }
      } catch (e) { stats.errors.push(`arbitrage:${(e as Error).message}`); }

      // 2) Anstehende Peak-Events → AICO_PeakEventPrecharge
      try {
        const in24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const { data: ev } = await sb
          .from("peak_shaving_event_calendar")
          .select("event_start, duration_min, target_soc_pct, precharge_power_kw, precharge_lead_min")
          .eq("tenant_id", li.tenant_id)
          .gte("event_start", nowIso)
          .lte("event_start", in24h)
          .order("event_start", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (ev) {
          const start = new Date(ev.event_start);
          const minSinceMidnight = start.getUTCHours() * 60 + start.getUTCMinutes();
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_PeakEventPrecharge", instance: 1, parameter: "EventStartMin", value_num: minSinceMidnight, source: "cron:peak-event", priority: 4 });
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_PeakEventPrecharge", instance: 1, parameter: "EventDurationMin", value_num: Number(ev.duration_min ?? 60), source: "cron:peak-event" });
          if (ev.target_soc_pct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_PeakEventPrecharge", instance: 1, parameter: "TargetSocPct", value_num: Number(ev.target_soc_pct), source: "cron:peak-event" });
          if (ev.precharge_power_kw != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_PeakEventPrecharge", instance: 1, parameter: "PrechargePowerKw", value_num: Number(ev.precharge_power_kw), source: "cron:peak-event" });
          if (ev.precharge_lead_min != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_PeakEventPrecharge", instance: 1, parameter: "PrechargeLeadMin", value_num: Number(ev.precharge_lead_min), source: "cron:peak-event" });
          stats.peakEvents++;
        }
      } catch (e) { stats.errors.push(`peak:${(e as Error).message}`); }

      // 3) Community-Anteil (aktuelles 15-min-Slot) → AICO_CommunityAllocation
      try {
        const slotStart = new Date(Math.floor(Date.now() / (15 * 60 * 1000)) * 15 * 60 * 1000).toISOString();
        const { data: alloc } = await sb
          .from("community_allocations_15min")
          .select("allocation_kw, share_of_demand_pct, community_price_ct")
          .eq("tenant_id", li.tenant_id)
          .eq("slot_start", slotStart)
          .maybeSingle();
        if (alloc) {
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_CommunityAllocation", instance: 1, parameter: "AllocationKw", value_num: Number(alloc.allocation_kw ?? 0), source: "cron:community" });
          if (alloc.share_of_demand_pct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_CommunityAllocation", instance: 1, parameter: "ShareOfDemandPct", value_num: Number(alloc.share_of_demand_pct), source: "cron:community" });
          if (alloc.community_price_ct != null) writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_CommunityAllocation", instance: 1, parameter: "CommunityPriceCt", value_num: Number(alloc.community_price_ct), source: "cron:community" });
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_CommunityAllocation", instance: 1, parameter: "AllocationActive", value_bool: Number(alloc.allocation_kw ?? 0) > 0, source: "cron:community" });
          stats.community++;
        }
      } catch (e) { stats.errors.push(`community:${(e as Error).message}`); }

      // 4) CO2-Fenster (aktueller Wert) → AICO_Co2LoadShift
      try {
        const { data: co2 } = await sb
          .from("co2_emission_factors")
          .select("g_co2_per_kwh, valid_from")
          .eq("tenant_id", li.tenant_id)
          .lte("valid_from", nowIso)
          .order("valid_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (co2?.g_co2_per_kwh != null) {
          writes.push({ tenant_id: li.tenant_id, location_integration_id: li.id, template_key: "AICO_Co2LoadShift", instance: 1, parameter: "CurrentGCo2PerKWh", value_num: Number(co2.g_co2_per_kwh), source: "cron:co2" });
          stats.co2++;
        }
      } catch (e) { stats.errors.push(`co2:${(e as Error).message}`); }

      if (writes.length > 0) {
        const rows = writes.map((w) => ({ ...w, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }));
        const { error: insErr } = await sb.from("loxone_pending_writes").insert(rows);
        if (insErr) stats.errors.push(`insert:${insErr.message}`);
      }
    }

    // Housekeeping
    await sb.rpc("cleanup_loxone_pending_writes").catch(() => null);

    return json(corsHeaders, { success: true, integrations: loxoneIntegrations.length, stats });
  } catch (e) {
    return json(corsHeaders, { success: false, error: (e as Error).message, stats }, 500);
  }
});

function json(headers: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
