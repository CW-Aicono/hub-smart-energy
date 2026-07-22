/**
 * bridge-aggregator
 * =================
 * Liest unverarbeitete Roh-Samples aus `bridge_raw_samples`, aggregiert sie
 * pro Meter × 5-Min-Bucket und schreibt sie in `meter_power_readings_5min`.
 *
 * Aufruf:
 *   - per pg_cron alle 5 Minuten (siehe Cron-Insert)
 *   - manuell via curl zum Testen
 *
 * Auth:
 *   Akzeptiert sowohl SUPABASE_ANON_KEY (von pg_net) als auch SERVICE_ROLE.
 *   Schreibt mit SERVICE_ROLE auf die Tabellen (verify_jwt = false in config.toml).
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_LIMIT = 50000; // max. Roh-Samples pro Lauf

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface RawSample {
  id: number;
  uuid: string;
  value: number;
  received_at: string;
  tenant_id: string | null;
}

interface Bucket {
  meter_id: string;
  tenant_id: string;
  energy_type: string;
  bucket: string; // ISO timestamp
  sum: number;
  max: number;
  count: number;
}

type MeterMapping = { id: string; tenant_id: string; energy_type: string; sensor_uuid: string | null };

function floor5min(iso: string): string {
  const d = new Date(iso);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5);
  return d.toISOString();
}

function loxoneFamilyKey(uuid: string | null | undefined): string | null {
  if (!uuid) return null;
  const parts = uuid.toLowerCase().split('-');
  return parts.length >= 3 ? `${parts[0]}-${parts[1]}` : null;
}

function loxoneThirdSegment(uuid: string | null | undefined): number | null {
  if (!uuid) return null;
  const part = uuid.toLowerCase().split('-')[2];
  if (!part || !/^[0-9a-f]{4}$/i.test(part.slice(0, 4))) return null;
  return parseInt(part.slice(0, 4), 16);
}

function isPlausibleElectricalPowerKw(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 500;
}

function resolveMeterForRawSample(
  raw: RawSample,
  exactByUuid: Map<string, MeterMapping>,
  byTenantFamily: Map<string, MeterMapping[]>,
): MeterMapping | null {
  const uuid = raw.uuid.toLowerCase();
  const exact = exactByUuid.get(uuid);
  if (exact) return exact;

  // Loxone WS sends neighbouring State-UUIDs for one object: live power,
  // max/reset/counter values etc. Meter mappings may still point at the base
  // object UUID. For electrical power, map a neighbouring plausible State-UUID
  // to the nearest stored meter UUID in the same Loxone family.
  if (!isPlausibleElectricalPowerKw(Number(raw.value))) return null;
  const family = loxoneFamilyKey(uuid);
  const rawThird = loxoneThirdSegment(uuid);
  if (!family || rawThird === null || !raw.tenant_id) return null;

  const candidates = (byTenantFamily.get(`${raw.tenant_id}|${family}`) ?? [])
    .filter((m) => m.energy_type === 'strom' && m.sensor_uuid);
  if (candidates.length === 0) return null;

  let best: { meter: MeterMapping; delta: number } | null = null;
  let tie = false;
  for (const meter of candidates) {
    const meterThird = loxoneThirdSegment(meter.sensor_uuid);
    if (meterThird === null) continue;
    const delta = Math.abs(rawThird - meterThird);
    if (!best || delta < best.delta) {
      best = { meter, delta };
      tie = false;
    } else if (delta === best.delta) {
      tie = true;
    }
  }

  if (!best || tie || best.delta > 32) return null;
  return best.meter;
}

async function run(): Promise<{
  raw_read: number;
  buckets_written: number;
  samples_processed: number;
  unmapped_uuids: number;
  error?: string;
}> {
  // 1) Roh-Samples lesen
  const { data: raw, error: rawErr } = await supabase
    .from('bridge_raw_samples')
    .select('id, uuid, value, received_at, tenant_id')
    .is('processed_at', null)
    .order('received_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (rawErr) return { raw_read: 0, buckets_written: 0, samples_processed: 0, unmapped_uuids: 0, error: rawErr.message };
  if (!raw || raw.length === 0) {
    return { raw_read: 0, buckets_written: 0, samples_processed: 0, unmapped_uuids: 0 };
  }

  // 2) UUID → Meter-Mapping holen (einmal, pro Lauf gecached)
  const tenantIds = [...new Set(raw.map((r: RawSample) => r.tenant_id).filter(Boolean) as string[])];
  const { data: meters, error: meterErr } = await supabase
    .from('meters')
    .select('id, tenant_id, energy_type, sensor_uuid')
    .in('tenant_id', tenantIds)
    .not('sensor_uuid', 'is', null)
    .eq('is_archived', false);

  if (meterErr) return { raw_read: raw.length, buckets_written: 0, samples_processed: 0, unmapped_uuids: 0, error: meterErr.message };

  const meterByUuid = new Map<string, MeterMapping>();
  const metersByTenantFamily = new Map<string, MeterMapping[]>();
  for (const m of meters ?? []) {
    if (!m.sensor_uuid) continue;
    meterByUuid.set(m.sensor_uuid.toLowerCase(), m as MeterMapping);
    const family = loxoneFamilyKey(m.sensor_uuid);
    if (!family) continue;
    const key = `${m.tenant_id}|${family}`;
    const list = metersByTenantFamily.get(key) ?? [];
    list.push(m as MeterMapping);
    metersByTenantFamily.set(key, list);
  }

  // 3) Pro (meter_id × 5-Min-Bucket) aggregieren
  const buckets = new Map<string, Bucket>();
  const processedIds: number[] = [];
  let unmapped = 0;

  for (const r of raw as RawSample[]) {
    const meter = resolveMeterForRawSample(r, meterByUuid, metersByTenantFamily);
    processedIds.push(r.id); // auch unmapped Roh-Samples als "verarbeitet" markieren
    if (!meter) { unmapped++; continue; }
    const bucket = floor5min(r.received_at);
    const key = `${meter.id}|${bucket}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        meter_id: meter.id,
        tenant_id: meter.tenant_id,
        energy_type: meter.energy_type,
        bucket,
        sum: 0,
        max: -Infinity,
        count: 0,
      };
      buckets.set(key, b);
    }
    b.sum += r.value;
    b.max = Math.max(b.max, r.value);
    b.count++;
  }

  // 4) Buckets upserten (ON CONFLICT meter_id, bucket, resolution_minutes)
  //    IO-Schutz: nur noch in die Haupt-Tabelle schreiben. Der frühere parallele
  //    Diagnose-/Schatten-Write nach `meter_power_readings_5min_bridge` hat laut
  //    pg_stat_statements signifikante zusätzliche WAL-/IO-Last erzeugt.
  let bucketsWritten = 0;
  if (buckets.size > 0) {
    const rows = [...buckets.values()].map((b) => ({
      meter_id: b.meter_id,
      tenant_id: b.tenant_id,
      energy_type: b.energy_type,
      bucket: b.bucket,
      power_avg: b.sum / b.count,
      power_max: b.max,
      sample_count: b.count,
      resolution_minutes: 5,
      source: 'bridge_ws',
    }));
    // upsert in Chunks à 1000
    for (let i = 0; i < rows.length; i += 1000) {
      const slice = rows.slice(i, i + 1000);
      const { error: errMain } = await supabase
        .from('meter_power_readings_5min')
        .upsert(slice, { onConflict: 'meter_id,bucket,resolution_minutes' });
      if (errMain) {
        return { raw_read: raw.length, buckets_written: bucketsWritten, samples_processed: 0, unmapped_uuids: unmapped, error: `main: ${errMain.message}` };
      }
      bucketsWritten += slice.length;
    }
  }

  // 5) Roh-Samples als verarbeitet markieren (Chunks à 1000 IDs)
  let samplesProcessed = 0;
  for (let i = 0; i < processedIds.length; i += 1000) {
    const slice = processedIds.slice(i, i + 1000);
    const { error } = await supabase
      .from('bridge_raw_samples')
      .update({ processed_at: new Date().toISOString() })
      .in('id', slice);
    if (error) {
      return { raw_read: raw.length, buckets_written: bucketsWritten, samples_processed: samplesProcessed, unmapped_uuids: unmapped, error: error.message };
    }
    samplesProcessed += slice.length;
  }

  return {
    raw_read: raw.length,
    buckets_written: bucketsWritten,
    samples_processed: samplesProcessed,
    unmapped_uuids: unmapped,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const result = await run();
    console.log('[bridge-aggregator]', JSON.stringify(result));
    return new Response(JSON.stringify({ success: !result.error, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: result.error ? 500 : 200,
    });
  } catch (err) {
    console.error('[bridge-aggregator] FATAL', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
