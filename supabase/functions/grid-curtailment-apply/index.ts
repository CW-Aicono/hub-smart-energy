// K2 §14a EnWG — Wendet ein Curtailment-Event auf alle SteuVE-Geräte einer Connection an.
//
// Eingabe: { event_id: uuid }  ODER  { connection_id: uuid }  (letzteres: nimmt aktuelles Event)
//
// Pro Ladepunkt: SetChargingProfile (stackLevel=5, profileId=140) > DLM (3/110) > PV (1) > limit (0).
// Min-Leistung wird in der Allocation nie unterschritten (§14a Abs.2 EnWG: ≥4,2 kW).
//
// Wärmepumpen / Batterien: Phase 2 — TODOs sind markiert.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const STACK_LEVEL = 5;
const PROFILE_ID = 140;
const SOURCE = "grid_curtailment";

interface SteuveDevice {
  id: string;
  device_type: "charge_point" | "heat_pump" | "battery";
  device_ref_id: string;
  min_power_kw: number;
  priority: number;
  active: boolean;
}

function kwToAmps(kw: number): number {
  return Math.max(6, Math.min(63, Math.round((kw * 1000) / (400 * Math.sqrt(3)))));
}

async function applyEvent(eventId: string) {
  const { data: ev, error } = await admin
    .from("grid_curtailment_events")
    .select("id, tenant_id, connection_id, curtailment_percent, valid_from, valid_until")
    .eq("id", eventId)
    .single();
  if (error || !ev) throw new Error(`Event ${eventId} not found`);

  const percent = Math.max(0, Math.min(100, Number(ev.curtailment_percent)));

  const { data: devices } = await admin
    .from("steuve_devices")
    .select("id, device_type, device_ref_id, min_power_kw, priority, active")
    .eq("connection_id", ev.connection_id)
    .eq("active", true)
    .order("priority", { ascending: true });

  if (!devices || devices.length === 0) {
    await admin
      .from("grid_curtailment_events")
      .update({ applied_at: new Date().toISOString(), applied_result: { skipped: "no_steuve_devices" } })
      .eq("id", ev.id);
    return { event_id: ev.id, applied: 0, skipped: "no_steuve_devices" };
  }

  // CP-Stammdaten zu device_ref_ids holen
  const cpIds = devices.filter((d) => d.device_type === "charge_point").map((d) => d.device_ref_id);
  const cpMap = new Map<string, { id: string; ocpp_id: string; ws_connected: boolean; supports_charging_profile: boolean | null; max_power_kw: number }>();
  if (cpIds.length > 0) {
    const { data: cps } = await admin
      .from("charge_points")
      .select("id, ocpp_id, ws_connected, supports_charging_profile, max_power_kw")
      .in("id", cpIds);
    for (const cp of cps ?? []) cpMap.set(cp.id, cp);
  }

  const applied: any[] = [];

  for (const d of devices as SteuveDevice[]) {
    if (d.device_type !== "charge_point") {
      // Phase 2: Wärmepumpe / Batterie via automation-core
      applied.push({ device_id: d.id, type: d.device_type, skipped: "not_implemented_phase2" });
      continue;
    }
    const cp = cpMap.get(d.device_ref_id);
    if (!cp) {
      applied.push({ device_id: d.id, skipped: "cp_not_found" });
      continue;
    }

    const max = Number(cp.max_power_kw ?? 22);
    const targetKw = Math.max(Number(d.min_power_kw), (max * percent) / 100);
    const targetAmps = kwToAmps(targetKw);

    // Idempotenz
    const { data: active } = await admin
      .from("charge_point_active_profile")
      .select("current_limit_a")
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", SOURCE)
      .maybeSingle();
    if (active?.current_limit_a != null && Number(active.current_limit_a) === targetAmps) {
      applied.push({ cp: cp.ocpp_id, target_kw: targetKw, amps: targetAmps, skipped: "unchanged" });
      continue;
    }
    if (!cp.ws_connected) {
      applied.push({ cp: cp.ocpp_id, target_kw: targetKw, skipped: "offline" });
      continue;
    }

    const useChangeConfig = cp.supports_charging_profile === false;
    const command = useChangeConfig ? "ChangeConfiguration" : "SetChargingProfile";
    const payload: Record<string, unknown> = useChangeConfig
      ? { key: "MaxChargingCurrent", value: String(targetAmps) }
      : {
          connectorId: 0,
          csChargingProfiles: {
            chargingProfileId: PROFILE_ID,
            stackLevel: STACK_LEVEL,
            chargingProfilePurpose: "TxDefaultProfile",
            chargingProfileKind: "Absolute",
            validFrom: ev.valid_from,
            validTo: ev.valid_until,
            chargingSchedule: {
              chargingRateUnit: "A",
              chargingSchedulePeriod: [{ startPeriod: 0, limit: targetAmps }],
            },
          },
        };

    await admin.from("pending_ocpp_commands").insert({
      charge_point_ocpp_id: cp.ocpp_id,
      command,
      payload,
      status: "pending",
    });

    await admin.from("charge_point_active_profile").upsert(
      {
        charge_point_id: cp.id,
        connector_id: 0,
        profile_purpose: "TxDefaultProfile",
        source: SOURCE,
        current_limit_a: targetAmps,
        applied_at: new Date().toISOString(),
        metadata: { command, event_id: ev.id, curtailment_percent: percent, valid_until: ev.valid_until },
      },
      { onConflict: "charge_point_id,connector_id,profile_purpose" },
    );

    applied.push({ cp: cp.ocpp_id, target_kw: Number(targetKw.toFixed(2)), amps: targetAmps });
  }

  await admin
    .from("grid_curtailment_events")
    .update({ applied_at: new Date().toISOString(), applied_result: { devices: applied, percent } })
    .eq("id", ev.id);

  return { event_id: ev.id, percent, applied: applied.length, details: applied };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    let eventId: string | null = body.event_id ?? null;

    if (!eventId && body.connection_id) {
      const { data: latest } = await admin
        .from("grid_curtailment_events")
        .select("id")
        .eq("connection_id", body.connection_id)
        .lte("valid_from", new Date().toISOString())
        .gte("valid_until", new Date().toISOString())
        .order("received_at", { ascending: false })
        .limit(1);
      eventId = latest?.[0]?.id ?? null;
    }

    if (!eventId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing event_id or no active event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await applyEvent(eventId);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[grid-curtailment-apply] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
