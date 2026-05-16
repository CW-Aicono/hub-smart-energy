/**
 * Helpers around the per-meter offset (`meters.meter_offset_kwh`).
 *
 * Use case: A meter that AICONO measures from 0 kWh (since pairing) but whose
 * physical display in the location shows a different absolute value
 * (e.g. legacy meter on customer onboarding, or device replacement).
 *
 * IMPORTANT semantics:
 *   - `displayed_value = measured_value + meter_offset_kwh`
 *   - DIFFERENCES over time (kWh/Tag, kWh/Monat, costs, CO2) are NOT affected
 *     by the offset – they cancel out. Only the absolute "Zählerstand" shown
 *     to the user changes.
 */

export const METER_OFFSET_REASONS = [
  { value: "initial_reading", label: "Anfangsbestand bei Übernahme" },
  { value: "device_replacement", label: "Gerätetausch (neues Gerät startet bei 0)" },
  { value: "manual_correction", label: "Manuelle Korrektur" },
] as const;

export type MeterOffsetReason = (typeof METER_OFFSET_REASONS)[number]["value"];

export function getMeterOffsetReasonLabel(reason?: string | null): string {
  return METER_OFFSET_REASONS.find((r) => r.value === reason)?.label ?? "—";
}

/** Apply the per-meter offset to a measured absolute meter value (kWh, m³, …). */
export function applyMeterOffset(
  measuredValue: number | null | undefined,
  meter: { meter_offset_kwh?: number | null } | null | undefined,
): number | null {
  if (measuredValue == null) return null;
  const offset = Number(meter?.meter_offset_kwh ?? 0);
  if (!Number.isFinite(offset) || offset === 0) return measuredValue;
  return measuredValue + offset;
}
