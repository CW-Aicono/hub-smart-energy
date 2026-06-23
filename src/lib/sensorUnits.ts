// Grouped unit options for meter/sensor "Einheit des Gateways" dropdowns.
// Used by AddMeterDialog and EditMeterDialog.

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
      { value: "m³", label: "m³" },
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
    label: "Durchfluss",
    options: [
      { value: "l/min", label: "l/min (Liter pro Minute)" },
      { value: "m³/h", label: "m³/h (Kubikmeter pro Stunde)" },
    ],
  },
  {
    label: "Zähler / Sonstiges",
    options: [
      { value: "Impulse", label: "Impulse" },
      { value: "Anzahl", label: "Anzahl" },
      { value: "bool", label: "An/Aus (bool)" },
    ],
  },
];

// Derive the energy-unit counterpart for power-style source units used by automatic meters.
export function deriveEnergyUnit(sourceUnit: string): string {
  if (sourceUnit === "m³") return "m³";
  if (sourceUnit === "kW") return "kWh";
  if (sourceUnit === "W") return "Wh";
  // For non-energy sensor units (°C, %, hPa, ...) the cumulative/energy counterpart equals the source unit.
  return sourceUnit;
}
