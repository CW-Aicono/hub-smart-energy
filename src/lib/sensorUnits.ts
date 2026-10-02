// Grouped unit options for meter/sensor "Einheit des Gateways" dropdowns.
// Used by AddMeterDialog, EditMeterDialog, BulkEditMetersDialog via SourceUnitPicker.

export interface SourceUnitOption {
  value: string;
  label: string;
}

export interface SourceUnitGroup {
  label: string;
  options: SourceUnitOption[];
}

export const SOURCE_UNIT_GROUPS: SourceUnitGroup[] = [
  {
    label: "Energie / Leistung",
    options: [
      { value: "kW", label: "kW / kWh" },
      { value: "W", label: "W / Wh" },
      { value: "MW", label: "MW / MWh" },
    ],
  },
  {
    label: "Temperatur",
    options: [
      { value: "°C", label: "°C (Grad Celsius)" },
      { value: "°F", label: "°F (Grad Fahrenheit)" },
      { value: "K", label: "K (Kelvin)" },
    ],
  },
  {
    label: "Feuchte / Anteil",
    options: [
      { value: "%", label: "% (Prozent)" },
      { value: "ppm", label: "ppm (Teile pro Million)" },
    ],
  },
  {
    label: "Druck",
    options: [
      { value: "hPa", label: "hPa (Hektopascal)" },
      { value: "bar", label: "bar" },
      { value: "Pa", label: "Pa (Pascal)" },
    ],
  },
  {
    label: "Helligkeit",
    options: [{ value: "lx", label: "lx (Lux)" }],
  },
  {
    label: "Strom / Spannung",
    options: [
      { value: "A", label: "A (Ampere)" },
      { value: "V", label: "V (Volt)" },
    ],
  },
  {
    label: "Durchfluss / Volumen",
    options: [
      { value: "m³/h", label: "m³/h (Durchfluss)" },
      { value: "m³", label: "m³ (Volumen / Zählerstand)" },
      { value: "l/min", label: "l/min (Liter pro Minute)" },
      { value: "l", label: "l (Liter)" },
    ],
  },
  {
    label: "Gewicht / Masse",
    options: [
      { value: "mg", label: "mg (Milligramm)" },
      { value: "g", label: "g (Gramm)" },
      { value: "kg", label: "kg (Kilogramm)" },
      { value: "t", label: "t (Tonne)" },
      { value: "kg/h", label: "kg/h (Kilogramm pro Stunde)" },
      { value: "t/h", label: "t/h (Tonnen pro Stunde)" },
      { value: "t/a", label: "t/a (Tonnen pro Jahr)" },
    ],
  },
  {
    label: "Zeit",
    options: [
      { value: "ms", label: "ms (Millisekunden)" },
      { value: "sek", label: "sek (Sekunden)" },
      { value: "min", label: "min (Minuten)" },
      { value: "std", label: "std (Stunden)" },
    ],
  },
  {
    label: "Zähler / Sonstiges",
    options: [
      { value: "Impulse", label: "Impulse" },
      { value: "Anzahl", label: "Anzahl" },
      { value: "bool", label: "An/Aus" },
    ],
  },
];

/** Optional extra categories exposed by BulkEditMetersDialog (cumulative energy). */
export const EXTRA_ENERGY_CUMULATIVE_GROUP: SourceUnitGroup = {
  label: "Energie (kumulativ)",
  options: [
    { value: "kWh", label: "kWh" },
    { value: "Wh", label: "Wh" },
    { value: "MWh", label: "MWh" },
  ],
};

/** Find the category label that contains the given unit value. */
export function getUnitCategory(
  value: string,
  extraGroups: SourceUnitGroup[] = [],
): string | null {
  const all = [...SOURCE_UNIT_GROUPS, ...extraGroups];
  for (const g of all) {
    if (g.options.some((o) => o.value === value)) return g.label;
  }
  return null;
}

/** Get the options list for a given category label. */
export function getUnitsForCategory(
  categoryLabel: string,
  extraGroups: SourceUnitGroup[] = [],
): SourceUnitOption[] {
  const all = [...SOURCE_UNIT_GROUPS, ...extraGroups];
  return all.find((g) => g.label === categoryLabel)?.options ?? [];
}

// Derive the energy-unit counterpart for power-style source units used by automatic meters.
export function deriveEnergyUnit(sourceUnit: string): string {
  if (sourceUnit === "m³" || sourceUnit === "m³/h") return "m³";
  if (sourceUnit === "l" || sourceUnit === "l/min") return "l";
  if (sourceUnit === "kW") return "kWh";
  if (sourceUnit === "W") return "Wh";
  if (sourceUnit === "MW") return "MWh";
  if (sourceUnit === "kg/h") return "kg";
  if (sourceUnit === "t/h" || sourceUnit === "t/a") return "t";
  // For non-energy sensor units (°C, %, hPa, kg, g, ...) the cumulative/energy counterpart equals the source unit.
  return sourceUnit;
}
