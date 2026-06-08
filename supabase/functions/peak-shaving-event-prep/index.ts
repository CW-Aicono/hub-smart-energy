// Peak-Shaving Event-Prep — Vor-Lade-Steuerung für geplante Events
//
// Aufgerufen alle 10 Minuten via pg_cron.
//
// Logik:
//  - Lade alle Events mit status IN ('planned','pre_charging') deren start_at innerhalb pre_charge_lead_hours liegt
//  - Wenn jetzt im Pre-Charge-Fenster: setze status='pre_charging', sende 'charge'-Befehl mit max_charge_kw
//  - Wenn current_soc_pct >= pre_charge_target_soc_pct: setze pre_charge_completed_at + status='completed'
//  - Wenn Event aktiv (now zwischen start_at..end_at): setze status='active' (Scheduler übernimmt Discharging)
//  - Wenn Event vorbei: setze status='completed'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function dispatchCharge(
  tenantId: string,
  configId: string,
  storage: { id: string; max_charge_kw: number; gateway_device_id: string | null },
  targetPowerKw: number,
  reason: string,
  calendarId: string,
) {
  // Idempotenz: letzter Befehl?
  const { data: last } = await admin
    .from("peak_shaving_dispatch_log")
    .select("action, target_power_kw")
    .eq("config_id", configId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && last.action === "charge" && Math.abs(Number(last.target_power_kw) - targetPowerKw) < 0.1) {
    return { skipped: "unchanged" };
  }

  let commandId: string | null = null;
  if (storage.gateway_device_id) {
    const { data: cmd } = await admin
      .from("gateway_commands")
      .insert({
        tenant_id: tenantId,
        gateway_device_id: storage.gateway_device_id,
        command_type: "storage_charge",
        payload: { storage_id: storage.id, target_power_kw: Number(targetPowerKw.toFixed(2)), source: "peak_shaving_event_prep" },
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    commandId = cmd?.id ?? null;
  }

  await admin.from("peak_shaving_dispatch_log").insert({
    config_id: configId,
    tenant_id: tenantId,
    storage_id: storage.id,
    gateway_command_id: commandId,
    calendar_id: calendarId,
    action: "charge",
    target_power_kw: targetPowerKw,
    reason,
    success: true,
    metadata: { gateway_dispatched: !!storage.gateway_device_id },
  });
  return { skipped: null, command_id: commandId };
}

async function run() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60_000);

  const { data: events } = await admin
    .from("peak_shaving_event_calendar")
    .select("*, peak_shaving_configs(tenant_id, storage_id)")
    .in("status", ["planned", "pre_charging", "active"])
    .lte("start_at", horizon.toISOString())
    .order("start_at", { ascending: true });

  const results: Array<{ id: string; action: string; detail?: string }> = [];

  for (const ev of events ?? []) {
    try {
      const cfg = (ev as any).peak_shaving_configs;
      if (!cfg) {
        results.push({ id: ev.id, action: "skip", detail: "config missing" });
        continue;
      }
      const startAt = new Date(ev.start_at);
      const endAt = new Date(ev.end_at);
      const preStart = new Date(startAt.getTime() - Number(ev.pre_charge_lead_hours) * 60 * 60_000);

      // 1) Event vorbei
      if (now >= endAt) {
        await admin
          .from("peak_shaving_event_calendar")
          .update({ status: "completed" })
          .eq("id", ev.id);
        results.push({ id: ev.id, action: "completed" });
        continue;
      }

      // 2) Event aktiv
      if (now >= startAt && now < endAt) {
        if (ev.status !== "active") {
          await admin.from("peak_shaving_event_calendar").update({ status: "active" }).eq("id", ev.id);
        }
        results.push({ id: ev.id, action: "active" });
        continue;
      }

      // 3) Im Pre-Charge-Fenster
      if (now >= preStart && now < startAt) {
        const { data: storage } = await admin
          .from("energy_storages")
          .select("id, max_charge_kw, current_soc_pct, gateway_device_id")
          .eq("id", cfg.storage_id)
          .maybeSingle();
        if (!storage) {
          results.push({ id: ev.id, action: "skip", detail: "storage missing" });
          continue;
        }
        const soc = storage.current_soc_pct == null ? null : Number(storage.current_soc_pct);
        const target = Number(ev.pre_charge_target_soc_pct);

        if (soc !== null && soc >= target) {
          // Ziel erreicht
          await admin
            .from("peak_shaving_event_calendar")
            .update({ status: "planned", pre_charge_completed_at: now.toISOString() })
            .eq("id", ev.id);
          results.push({ id: ev.id, action: "soc_reached" });
          continue;
        }

        if (ev.status !== "pre_charging") {
          await admin
            .from("peak_shaving_event_calendar")
            .update({ status: "pre_charging", pre_charge_started_at: now.toISOString() })
            .eq("id", ev.id);
        }
        const dispatch = await dispatchCharge(
          cfg.tenant_id,
          ev.config_id,
          { id: storage.id, max_charge_kw: Number(storage.max_charge_kw), gateway_device_id: storage.gateway_device_id },
          Number(storage.max_charge_kw),
          `pre_charge_for_event:${ev.event_name}`,
          ev.id,
        );
        results.push({ id: ev.id, action: "pre_charging", detail: dispatch.skipped ?? "dispatched" });
        continue;
      }

      results.push({ id: ev.id, action: "waiting", detail: `pre_start ${preStart.toISOString()}` });
    } catch (e) {
      results.push({ id: ev.id, action: "error", detail: (e as Error).message });
    }
  }

  return { processed: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const out = await run();
    console.log(`[peak-shaving-event-prep] processed=${out.processed}`, JSON.stringify(out.results));
    return new Response(JSON.stringify({ ok: true, ...out }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[peak-shaving-event-prep] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
