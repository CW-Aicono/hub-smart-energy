// Live 5-Minuten-Verdichtung für OCPP-Leistungswerte.
// Berechnet die betroffenen Buckets aus allen Rohwerten neu (nicht nur aus dem
// aktuellen Request), damit parallele Requests sich nicht überschreiben. Die
// nächtliche Verdichtung liefert für dieselben Buckets dasselbe Ergebnis.

export interface RawPowerRow {
  meter_id: string;
  tenant_id: string;
  energy_type: string;
  power_value: number | string;
  recorded_at: string;
}

const BUCKET_MS = 5 * 60 * 1000;

export function bucketStart(iso: string): string {
  return new Date(Math.floor(new Date(iso).getTime() / BUCKET_MS) * BUCKET_MS).toISOString();
}

export function aggregateTo5min(rows: RawPowerRow[], source = "ocpp_live") {
  const map = new Map<string, { meter_id: string; tenant_id: string; energy_type: string; bucket: string; sum: number; max: number; count: number }>();
  for (const r of rows) {
    const v = Number(r.power_value);
    if (!Number.isFinite(v)) continue;
    const bucket = bucketStart(r.recorded_at);
    const key = `${r.meter_id}::${bucket}`;
    const e = map.get(key);
    if (e) { e.sum += v; e.max = Math.max(e.max, v); e.count++; }
    else map.set(key, { meter_id: r.meter_id, tenant_id: r.tenant_id, energy_type: r.energy_type, bucket, sum: v, max: v, count: 1 });
  }
  return [...map.values()].map((b) => ({
    meter_id: b.meter_id, tenant_id: b.tenant_id, energy_type: b.energy_type,
    bucket: b.bucket, power_avg: b.sum / b.count, power_max: b.max,
    sample_count: b.count, resolution_minutes: 5, source,
  }));
}

// deno-lint-ignore no-explicit-any
export async function refreshLive5min(admin: any, inserted: RawPowerRow[]) {
  if (inserted.length === 0) return 0;
  const meterIds = [...new Set(inserted.map((r) => r.meter_id))];
  const times = inserted.map((r) => new Date(bucketStart(r.recorded_at)).getTime());
  const from = new Date(Math.min(...times)).toISOString();
  const to = new Date(Math.max(...times) + BUCKET_MS).toISOString();
  const { data, error } = await admin
    .from("meter_power_readings")
    .select("meter_id, tenant_id, energy_type, power_value, recorded_at")
    .in("meter_id", meterIds)
    .gte("recorded_at", from)
    .lt("recorded_at", to)
    .limit(10000);
  if (error) { console.warn("[live-5min] read failed", error.message); return 0; }
  const rows = aggregateTo5min((data ?? []) as RawPowerRow[]);
  if (rows.length === 0) return 0;
  const { error: uErr } = await admin
    .from("meter_power_readings_5min")
    .upsert(rows, { onConflict: "meter_id,bucket,resolution_minutes" });
  if (uErr) { console.warn("[live-5min] upsert failed", uErr.message); return 0; }
  return rows.length;
}
