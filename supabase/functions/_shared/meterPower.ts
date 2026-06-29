// Shared helper: resolve the latest live power (kW) for a meter.
//
// Supports:
//   • capture_type='simulation' → reads simulation_meter_state.current_value
//                                   (interprets sim_unit; treats W as raw/1000)
//   • capture_type='virtual'    → walks virtual_meter_sources and sums with
//                                   per-source +/- operator. Sources may be:
//                                     - another meter (recursively resolved)
//                                     - a charge point      (latest OCPP power)
//                                     - a charge-point group (sum)
//                                     - all CPs of the virtual meter's location
//   • everything else           → latest meter_power_readings_5min, falling
//                                   back to raw meter_power_readings within
//                                   the recent window.
//
// Returns kW (positive = consumption/import, negative = feed-in/export).
// Returns null when nothing recent is available (caller decides whether to
// treat that as "no data" or as 0).

type Admin = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.45.0").createClient>;

const RECENT_WINDOW_MIN = 5;

async function readCpLivePowerKw(
  admin: Admin,
  chargePointIds: string[],
): Promise<Record<string, number>> {
  if (chargePointIds.length === 0) return {};
  const since = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data } = await admin
    .from("ocpp_meter_samples")
    .select("charge_point_id, measurand, unit, value, sampled_at")
    .in("charge_point_id", chargePointIds)
    .in("measurand", ["Power.Active.Import", "Power.Active.Export"])
    .gte("sampled_at", since)
    .order("sampled_at", { ascending: false });
  const seen = new Map<string, { imp?: number; exp?: number }>();
  (data ?? []).forEach((row: any) => {
    const entry = seen.get(row.charge_point_id) ?? {};
    const kw = row.unit === "kW" ? Number(row.value) : Number(row.value) / 1000;
    if (row.measurand === "Power.Active.Import" && entry.imp === undefined) entry.imp = kw;
    if (row.measurand === "Power.Active.Export" && entry.exp === undefined) entry.exp = kw;
    seen.set(row.charge_point_id, entry);
  });
  const out: Record<string, number> = {};
  for (const id of chargePointIds) {
    const v = seen.get(id);
    out[id] = (v?.imp ?? 0) - (v?.exp ?? 0);
  }
  return out;
}

async function readSimulationKw(
  admin: Admin,
  meterId: string,
  simUnit: string | null,
): Promise<number> {
  const { data: sim } = await admin
    .from("simulation_meter_state")
    .select("current_value")
    .eq("meter_id", meterId)
    .maybeSingle();
  if (!sim) return 0;
  const raw = Number(sim.current_value);
  const unit = String(simUnit ?? "kW").toLowerCase();
  return unit === "w" ? raw / 1000 : raw;
}

async function readPlainMeterKw(admin: Admin, meterId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data: agg } = await admin
    .from("meter_power_readings_5min")
    .select("power_avg")
    .eq("meter_id", meterId)
    .gte("bucket", cutoff)
    .order("bucket", { ascending: false })
    .limit(1);
  if (agg && agg.length > 0) return Number(agg[0].power_avg);
  const { data: raw } = await admin
    .from("meter_power_readings")
    .select("power_value")
    .eq("meter_id", meterId)
    .gte("recorded_at", cutoff)
    .order("recorded_at", { ascending: false })
    .limit(1);
  return raw && raw.length > 0 ? Number(raw[0].power_value) : null;
}

export async function fetchLatestMeterPowerKw(
  admin: Admin,
  meterId: string,
  visited: Set<string> = new Set(),
): Promise<number | null> {
  if (visited.has(meterId)) return 0; // cycle guard
  visited.add(meterId);

  const { data: meter } = await admin
    .from("meters")
    .select("id, capture_type, sim_unit, location_id")
    .eq("id", meterId)
    .maybeSingle();
  if (!meter) return null;

  if (meter.capture_type === "simulation") {
    return readSimulationKw(admin, meterId, meter.sim_unit as string | null);
  }

  if (meter.capture_type === "virtual") {
    const { data: sources } = await admin
      .from("virtual_meter_sources")
      .select(
        "operator, source_meter_id, source_charge_point_id, source_charge_point_group_id, source_all_charge_points, sort_order",
      )
      .eq("virtual_meter_id", meterId)
      .order("sort_order");
    if (!sources || sources.length === 0) return null;

    // Collect CP ids we need to resolve in one shot
    const cpIds = new Set<string>();
    const groupIds = new Set<string>();
    let needAllCps = false;
    sources.forEach((s: any) => {
      if (s.source_charge_point_id) cpIds.add(s.source_charge_point_id);
      else if (s.source_charge_point_group_id) groupIds.add(s.source_charge_point_group_id);
      else if (s.source_all_charge_points) needAllCps = true;
    });

    // Expand groups / all-cps to concrete CP ids using charge_points table
    let cpRows: Array<{ id: string; group_id: string | null; location_id: string | null }> = [];
    if (groupIds.size > 0 || needAllCps) {
      const { data } = await admin
        .from("charge_points")
        .select("id, group_id, location_id");
      cpRows = (data ?? []) as any;
      cpRows.forEach((cp) => {
        if (cp.group_id && groupIds.has(cp.group_id)) cpIds.add(cp.id);
        if (needAllCps && cp.location_id === meter.location_id) cpIds.add(cp.id);
      });
    }

    const cpLive = await readCpLivePowerKw(admin, Array.from(cpIds));

    let total = 0;
    let anyResolved = false;
    for (const s of sources as any[]) {
      let v: number | null = null;
      if (s.source_meter_id) {
        v = await fetchLatestMeterPowerKw(admin, s.source_meter_id, visited);
      } else if (s.source_charge_point_id) {
        v = cpLive[s.source_charge_point_id] ?? 0;
      } else if (s.source_charge_point_group_id) {
        v = cpRows
          .filter((cp) => cp.group_id === s.source_charge_point_group_id)
          .reduce((sum, cp) => sum + (cpLive[cp.id] ?? 0), 0);
      } else if (s.source_all_charge_points) {
        v = cpRows
          .filter((cp) => cp.location_id === meter.location_id)
          .reduce((sum, cp) => sum + (cpLive[cp.id] ?? 0), 0);
      }
      if (v === null) continue;
      anyResolved = true;
      total += s.operator === "-" ? -v : v;
    }
    return anyResolved ? total : null;
  }

  return readPlainMeterKw(admin, meterId);
}
