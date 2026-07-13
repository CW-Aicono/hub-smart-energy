/**
 * Frontend-Port der UUID→Meter-Auflösung aus
 * `supabase/functions/bridge-aggregator/index.ts`.
 *
 * Hintergrund:
 * - `meters.sensor_uuid` speichert die Basis-Objekt-UUID eines Loxone-Blocks
 *   (Suffix = Miniserver-MAC, z. B. `…-ffffed57184a04d2`).
 * - Der Loxone-WS-Worker emittiert die State-/Sub-Output-UUIDs desselben Objekts
 *   (gleiche ersten beiden Segmente, andere 3./4./5. Gruppe).
 * - Der `bridge-aggregator` mappt beides serverseitig via Family-Key
 *   (erste 2 UUID-Segmente + tenant) + Nearest-Match im 3. Segment (Delta ≤ 32),
 *   mit Plausibilitätsfilter für elektrische Leistungen.
 *
 * Damit der Live-Pfad (Broadcast + `bridge_raw_samples`-Seed) im Frontend
 * dieselben Meter trifft wie der Aggregator, spiegeln wir die Logik hier.
 */

export type ResolverMeter = {
  id: string;
  tenant_id: string | null;
  energy_type: string | null;
  sensor_uuid: string | null;
};

export function loxoneFamilyKey(uuid: string | null | undefined): string | null {
  if (!uuid) return null;
  const parts = uuid.toLowerCase().split("-");
  return parts.length >= 3 ? `${parts[0]}-${parts[1]}` : null;
}

export function loxoneFamilyPrefix(uuid: string | null | undefined): string | null {
  const fam = loxoneFamilyKey(uuid);
  return fam ? `${fam}-` : null;
}

export function loxoneThirdSegment(uuid: string | null | undefined): number | null {
  if (!uuid) return null;
  const part = uuid.toLowerCase().split("-")[2];
  if (!part || !/^[0-9a-f]{4}/i.test(part.slice(0, 4))) return null;
  return parseInt(part.slice(0, 4), 16);
}

export function isPlausibleElectricalPowerKw(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 500;
}

export interface LoxoneResolver {
  /** Auflösen einer Bridge-UUID auf eine Meter-ID (oder null). */
  resolve: (uuid: string, tenantId: string | null, value: number) => string | null;
  /** Alle Family-Prefixe (`XXXX-YYYY-`) aller bekannten Meter — für Seed-Queries. */
  familyPrefixes: string[];
  /** Direkt-Lookup für Nicht-Loxone-Zähler (Shelly/HA/Gateway). */
  exactByUuid: Map<string, ResolverMeter>;
}

/**
 * Baut einen Resolver, der Bridge-Events auf Meter-IDs abbildet.
 * - Exact-Match hat Vorrang.
 * - Fallback: Family + Tenant + Nearest-3rd-Segment (Delta ≤ 32), nur für
 *   plausibel elektrische Leistungswerte und `energy_type === 'strom'`.
 */
export function buildLoxoneResolver(meters: ResolverMeter[]): LoxoneResolver {
  const exactByUuid = new Map<string, ResolverMeter>();
  const byTenantFamily = new Map<string, ResolverMeter[]>();
  const familyPrefixSet = new Set<string>();

  for (const m of meters) {
    if (!m.sensor_uuid) continue;
    const uuid = m.sensor_uuid.toLowerCase();
    exactByUuid.set(uuid, m);
    const family = loxoneFamilyKey(uuid);
    if (family && m.tenant_id) {
      const key = `${m.tenant_id}|${family}`;
      const arr = byTenantFamily.get(key) ?? [];
      arr.push(m);
      byTenantFamily.set(key, arr);
      familyPrefixSet.add(`${family}-`);
    }
  }

  const resolve = (uuid: string, tenantId: string | null, value: number): string | null => {
    const normalized = uuid.toLowerCase();
    const exact = exactByUuid.get(normalized);
    if (exact) return exact.id;
    if (!tenantId) return null;
    if (!isPlausibleElectricalPowerKw(value)) return null;

    const family = loxoneFamilyKey(normalized);
    const rawThird = loxoneThirdSegment(normalized);
    if (!family || rawThird === null) return null;

    const candidates = (byTenantFamily.get(`${tenantId}|${family}`) ?? [])
      .filter((m) => m.energy_type === "strom" && m.sensor_uuid);
    if (candidates.length === 0) return null;

    let best: { meter: ResolverMeter; delta: number } | null = null;
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
    return best.meter.id;
  };

  return {
    resolve,
    familyPrefixes: [...familyPrefixSet],
    exactByUuid,
  };
}
