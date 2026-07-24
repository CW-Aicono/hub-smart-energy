/**
 * Zentrale Hilfsfunktionen, um aus einer Zähler-Definition (unit + energy_type)
 * die korrekte Anzeige-Einheit für Leistung (Rate) bzw. Energie/Verbrauch (Total)
 * abzuleiten.
 *
 * Nutzt die in der Zählerkonfiguration hinterlegte Einheit (`meters.unit`), damit
 * Wasser-/Gaszähler nicht fälschlich in kW/kWh dargestellt werden.
 */

export type MeterLike = {
  unit?: string | null;
  source_unit_power?: string | null;
  energy_type?: string | null;
};

/** Anzeige-Einheit für Leistung/Rate (z. B. kW, W, m³/h). */
export function powerUnitForMeter(m?: MeterLike | null, fallback: string = "kW"): string {
  const u = m?.source_unit_power ?? m?.unit;
  if (u === "Wh") return "W";
  if (u === "kWh") return "kW";
  if (u === "MWh") return "MW";
  if (u === "m³") return "m³/h";
  if (u === "L") return "L/h";
  if (u === "°C") return "°C";
  if (u) return u;
  if (m?.energy_type === "gas" || m?.energy_type === "wasser") return "m³/h";
  if (fallback === "kWh") return "kW";
  return fallback;
}

/** Anzeige-Einheit für Energie/Verbrauch (z. B. kWh, m³, L). */
export function energyUnitForMeter(m?: MeterLike | null, fallback: string = "kWh"): string {
  if (m?.unit) return m.unit;
  if (m?.energy_type === "gas" || m?.energy_type === "wasser") return "m³";
  return fallback;
}

/** Vorschlag für Standard-Einheit im Widget-Designer basierend auf gewählten Zählern. */
export function suggestWidgetUnit(meters: MeterLike[], period: "day" | "aggregate" = "aggregate"): string {
  const first = meters.find(Boolean);
  if (!first) return period === "day" ? "kW" : "kWh";
  return period === "day" ? powerUnitForMeter(first) : energyUnitForMeter(first);
}

/** Auswahlliste für Einheiten im Widget-Designer. */
export const WIDGET_UNIT_OPTIONS = [
  "kWh", "kW", "MWh", "MW", "Wh", "W",
  "m³", "m³/h", "L", "L/h",
  "°C", "%", "€",
];
