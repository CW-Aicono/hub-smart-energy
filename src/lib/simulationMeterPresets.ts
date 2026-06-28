/**
 * Voreinstellungen für Testzähler (capture_type = 'simulation').
 * Wird im Anlegen-Dialog als Auswahl angeboten und liefert die Default-Werte
 * für sim_min, sim_max, sim_step, sim_unit, sim_bidirectional.
 */
export interface SimulationPreset {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  bidirectional: boolean;
  hint?: string;
  /** "meter" → DLM-Referenzzähler, Lastmanagement; "sensor" → Automation */
  suggestedDeviceType: "meter" | "sensor";
}

export const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    id: "kw-bidi",
    label: "Leistung kW (bidirektional, −100…+100)",
    unit: "kW",
    min: -100,
    max: 100,
    step: 0.1,
    bidirectional: true,
    hint: "Empfohlen für DLM-Referenzzähler: positive Werte = Netzbezug, negative = Einspeisung.",
    suggestedDeviceType: "meter",
  },
  {
    id: "kw-cons",
    label: "Leistung kW (Bezug 0…500)",
    unit: "kW",
    min: 0,
    max: 500,
    step: 0.5,
    bidirectional: false,
    suggestedDeviceType: "meter",
  },
  {
    id: "w",
    label: "Leistung W (−10.000…+10.000)",
    unit: "W",
    min: -10000,
    max: 10000,
    step: 10,
    bidirectional: true,
    suggestedDeviceType: "meter",
  },
  {
    id: "a",
    label: "Strom A (0…250, pro Phase)",
    unit: "A",
    min: 0,
    max: 250,
    step: 1,
    bidirectional: false,
    suggestedDeviceType: "meter",
  },
  {
    id: "percent",
    label: "Prozent % (0…100)",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    bidirectional: false,
    suggestedDeviceType: "sensor",
  },
  {
    id: "celsius",
    label: "Temperatur °C (−20…+60)",
    unit: "°C",
    min: -20,
    max: 60,
    step: 0.1,
    bidirectional: true,
    suggestedDeviceType: "sensor",
  },
  {
    id: "lux",
    label: "Helligkeit lx (0…100.000)",
    unit: "lx",
    min: 0,
    max: 100000,
    step: 100,
    bidirectional: false,
    suggestedDeviceType: "sensor",
  },
  {
    id: "bool",
    label: "Schalter / Trigger (0 oder 1)",
    unit: "",
    min: 0,
    max: 1,
    step: 1,
    bidirectional: false,
    hint: "Für Automationen als boolescher Eingang.",
    suggestedDeviceType: "sensor",
  },
];

export const DEFAULT_SIMULATION_PRESET = SIMULATION_PRESETS[0];
