// K2 §14a EnWG — Allokation der DSO-Drosselung auf SteuVE-Geräte (Cloud-Mirror).
// Wird sowohl im Frontend (Vorschau) als auch in der Edge-Function genutzt.

export interface SteuveInput {
  id: string;
  device_ref_id: string;
  device_type: "charge_point" | "heat_pump" | "battery";
  max_power_kw: number;
  min_power_kw: number;
  priority: number;
  active: boolean;
}

export interface CurtailmentAllocation {
  id: string;
  device_ref_id: string;
  device_type: SteuveInput["device_type"];
  target_kw: number;
  source_max_kw: number;
  min_kw: number;
  was_throttled: boolean;
}

/**
 * Berechnet pro SteuVE-Gerät die Ziel­leistung.
 *
 * Regeln:
 *  - percent = 100  → keine Drosselung (target = max_power_kw)
 *  - percent =   0  → maximale Drosselung, aber NIE unter `min_power_kw`
 *                     (gesetzlicher Mindestbezug §14a EnWG)
 *  - inaktive Geräte werden ignoriert
 *  - sortiert deterministisch nach priority asc (niedrige Zahl = wichtiger)
 */
export function allocateCurtailment(
  curtailmentPercent: number,
  devices: SteuveInput[],
): CurtailmentAllocation[] {
  const p = Math.max(0, Math.min(100, Math.round(curtailmentPercent)));
  return devices
    .filter((d) => d.active)
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((d) => {
      const target = Math.max(d.min_power_kw, (d.max_power_kw * p) / 100);
      return {
        id: d.id,
        device_ref_id: d.device_ref_id,
        device_type: d.device_type,
        target_kw: Number(target.toFixed(2)),
        source_max_kw: d.max_power_kw,
        min_kw: d.min_power_kw,
        was_throttled: target < d.max_power_kw - 0.01,
      };
    });
}

/**
 * Liefert das aktuell gültige Curtailment-Event aus einer Liste.
 */
export function findActiveEvent<T extends { valid_from: string; valid_until: string }>(
  events: T[],
  now: Date = new Date(),
): T | null {
  const ts = now.getTime();
  return (
    events.find((e) => new Date(e.valid_from).getTime() <= ts && new Date(e.valid_until).getTime() > ts) ?? null
  );
}
