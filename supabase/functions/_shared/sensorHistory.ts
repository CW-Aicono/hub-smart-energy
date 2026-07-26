// Shared helper: persist sensor snapshot values into sensor_readings_raw for history/graphs.
// Uses in-memory delta-guard per warm function instance to minimize IO.
// Skips inserts if kill-switch `sensor_history_enabled` is false.

type SensorItem = {
  id?: string;
  uuid?: string;
  rawValue?: unknown;
  value?: unknown;
  state?: unknown;
  unit?: string;
  type?: string;
  status?: string;
};

type Options = {
  locationIntegrationId: string;
  tenantId?: string | null;
  locationId?: string | null;
  sensors: SensorItem[];
};

// Per-warm-instance cache
const lastCache = new Map<string, { value: number; atMs: number }>();
let killSwitchCache: { enabled: boolean; checkedAt: number } | null = null;
const KILL_TTL_MS = 60_000;

async function isEnabled(supabase: any): Promise<boolean> {
  const now = Date.now();
  if (killSwitchCache && now - killSwitchCache.checkedAt < KILL_TTL_MS) {
    return killSwitchCache.enabled;
  }
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sensor_history_enabled")
      .maybeSingle();
    const raw = String((data as any)?.value ?? "true").toLowerCase();
    const enabled = raw !== "false" && raw !== "0" && raw !== "off";
    killSwitchCache = { enabled, checkedAt: now };
    return enabled;
  } catch {
    killSwitchCache = { enabled: true, checkedAt: now };
    return true;
  }
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "" || t === "-") return null;
    if (t === "ein" || t === "an" || t === "on" || t === "true") return 1;
    if (t === "aus" || t === "off" || t === "false") return 0;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function persistSensorHistory(supabase: any, opts: Options): Promise<void> {
  try {
    if (!opts.locationIntegrationId || !Array.isArray(opts.sensors) || opts.sensors.length === 0) return;
    if (!(await isEnabled(supabase))) return;

    // Build uuid → numeric value map from snapshot
    const valueByUuid = new Map<string, { value: number; unit: string | null }>();
    for (const s of opts.sensors) {
      const rawId = s?.id ?? s?.uuid;
      if (!rawId) continue;
      const num = toNumber(s?.rawValue) ?? toNumber(s?.value) ?? toNumber(s?.state);
      if (num == null) continue;
      valueByUuid.set(String(rawId).toLowerCase(), { value: num, unit: (s?.unit ?? null) as string | null });
    }
    if (valueByUuid.size === 0) return;

    // Resolve meters tenant-/integration-scoped and match UUIDs case-insensitively in JS.
    // Avoids large PostgREST IN URLs and catches Home Assistant entity-id casing drift.
    let meterQ = supabase
      .from("meters")
      .select("id, tenant_id, sensor_uuid, location_integration_id")
      .not("sensor_uuid", "is", null)
      .eq("is_archived", false);
    if (opts.tenantId) meterQ = meterQ.eq("tenant_id", opts.tenantId);
    if (opts.locationIntegrationId) meterQ = meterQ.eq("location_integration_id", opts.locationIntegrationId);

    let { data: meters, error: mErr } = await meterQ.limit(1000);
    if (mErr) {
      console.warn("[sensor-history] meter lookup failed:", mErr.message);
      return;
    }
    if ((!meters || meters.length === 0) && opts.tenantId) {
      const fallback = await supabase
        .from("meters")
        .select("id, tenant_id, sensor_uuid, location_integration_id")
        .not("sensor_uuid", "is", null)
        .eq("tenant_id", opts.tenantId)
        .eq("is_archived", false)
        .limit(1000);
      if (fallback.error) {
        console.warn("[sensor-history] fallback meter lookup failed:", fallback.error.message);
        return;
      }
      meters = fallback.data;
    }
    if (!meters || meters.length === 0) {
      console.log(`[sensor-history] no meters matched for li=${opts.locationIntegrationId} tenant=${opts.tenantId} (snapshot uuids=${valueByUuid.size})`);
      return;
    }
    console.log(`[sensor-history] li=${opts.locationIntegrationId} meters=${meters.length} snapshotUuids=${valueByUuid.size}`);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rows: any[] = [];

    for (const m of meters as any[]) {
      const uuid = String(m.sensor_uuid).toLowerCase();
      const entry = valueByUuid.get(uuid);
      if (!entry) continue;

      const prev = lastCache.get(m.id);
      // Delta-Guard: skip when unchanged (rel<1% AND abs<0.05) within 60s
      if (prev) {
        const dv = Math.abs(entry.value - prev.value);
        const rel = prev.value !== 0 ? dv / Math.abs(prev.value) : Infinity;
        const ageMs = nowMs - prev.atMs;
        if (dv < 0.05 && rel < 0.01 && ageMs < 60_000) continue;
        // Also skip perfectly identical values within 5 minutes
        if (dv === 0 && ageMs < 5 * 60_000) continue;
      }

      rows.push({
        tenant_id: m.tenant_id,
        meter_id: m.id,
        sensor_uuid: uuid,
        value: entry.value,
        unit: entry.unit,
        recorded_at: nowIso,
      });
      lastCache.set(m.id, { value: entry.value, atMs: nowMs });
    }

    // LRU-ish trim
    if (lastCache.size > 10_000) {
      const excess = lastCache.size - 10_000;
      let i = 0;
      for (const k of lastCache.keys()) { if (i++ >= excess) break; lastCache.delete(k); }
    }

    if (rows.length === 0) {
      console.log(`[sensor-history] li=${opts.locationIntegrationId} nothing to insert (delta-guard filtered ${meters.length} candidates)`);
      return;
    }
    const { error } = await supabase.from("sensor_readings_raw").insert(rows);
    if (error) console.warn(`[sensor-history] insert failed for li=${opts.locationIntegrationId} rows=${rows.length}:`, error.message);
    else console.log(`[sensor-history] li=${opts.locationIntegrationId} inserted ${rows.length} rows`);
  } catch (err) {
    console.warn("[sensor-history] unexpected error:", err);
  }
}
  } catch (err) {
    console.warn("[sensor-history] unexpected error:", err);
  }
}
