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
  if (u === "L" || u === "l") return "l/h";
  if (u === "mg") return "mg/h";
  if (u === "g") return "g/h";
  if (u === "kg") return "kg/h";
  if (u === "t") return "t/h";
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

/** Medien-/Geräteart, aus der Bezeichnungen für Rate/Summe abgeleitet werden. */
export type MeterKind = "power" | "volume" | "mass" | "sensor" | "boolean" | "generic";

const POWER_UNITS = new Set(["w","kw","mw","gw","wh","kwh","mwh","gwh","va","kva","mva","var","kvar","mvar"]);
const VOLUME_UNITS = new Set(["m³","m3","m³/h","m3/h","l","liter","l/h","l/min"]);
const MASS_UNITS = new Set(["mg","g","kg","t","mg/h","g/h","kg/h","t/h","t/a"]);
const BOOL_UNITS = new Set(["bool","boolean","on/off","an/aus"]);

export function meterKindFor(m?: MeterLike | null): MeterKind {
  const raw = (m?.unit ?? m?.source_unit_power ?? "").toString().trim();
  const u = raw.toLowerCase().replace(/\s+/g, "");
  if (!u) {
    if (m?.energy_type === "gas" || m?.energy_type === "wasser") return "volume";
    return "power";
  }
  if (POWER_UNITS.has(u)) return "power";
  if (VOLUME_UNITS.has(u)) return "volume";
  if (MASS_UNITS.has(u)) return "mass";
  if (BOOL_UNITS.has(u)) return "boolean";
  return "sensor";
}

export function labelsFor(kind: MeterKind): { rate: string; sum: string } {
  switch (kind) {
    case "power":   return { rate: "Leistung",    sum: "Energie" };
    case "volume":  return { rate: "Durchfluss",  sum: "Volumen" };
    case "mass":    return { rate: "Massenstrom", sum: "Masse"   };
    case "sensor":  return { rate: "Wert",        sum: "Wert"    };
    case "boolean": return { rate: "Zustand",     sum: "Zustand" };
    default:        return { rate: "Rate",        sum: "Summe"   };
  }
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
