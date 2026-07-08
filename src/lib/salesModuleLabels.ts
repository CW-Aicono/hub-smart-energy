// Deutsche Bezeichnungen und Kurzbeschreibungen für AICONO-Lizenzmodule.
// Wird im Sales-Scout sowie in Angebots-Exports verwendet, damit Kunden nicht
// technische Codes wie "arbitrage_trading" sehen, sondern verständliche Titel.

export interface ModuleLabel {
  title: string;
  description: string;
}

export const SALES_MODULE_LABELS: Record<string, ModuleLabel> = {
  locations: {
    title: "Liegenschaftsverwaltung",
    description: "Verwaltung von Standorten, Gebäuden und Zählpunkten.",
  },
  energy_monitoring: {
    title: "Energiemonitoring",
    description: "Basis-Modul: Erfassung und Visualisierung aller Energieverbräuche.",
  },
  live_values: {
    title: "Live-Werte",
    description: "Echtzeit-Anzeige aller Messpunkte im Dashboard.",
  },
  alerts: {
    title: "Alarme",
    description: "Automatische Schwellwert-Alarme bei Verbrauchsanomalien.",
  },
  reporting: {
    title: "Berichte & Auswertungen",
    description: "Standardberichte, Exporte und periodische Auswertungen.",
  },
  integrations: {
    title: "Geräte-Anbindungen",
    description: "Anbindung von Zählern, Sensoren und Gateways.",
  },
  automation_multi: {
    title: "Automatisierung Multi-Standort",
    description: "Regel- und Ablaufsteuerung über mehrere Verteilungen bzw. Standorte.",
  },
  automation_building: {
    title: "Gebäudeautomation",
    description: "Automatisierungen und Szenen innerhalb einer Liegenschaft.",
  },
  ev_charging: {
    title: "E-Ladeinfrastruktur",
    description: "Management von Ladepunkten inkl. Abrechnung und PV-Überschussladen.",
  },
  tenant_electricity: {
    title: "Mieterstrom",
    description: "Mieterstrommodell mit Zuordnung, Abrechnung und Verbrauchserfassung.",
  },
  arbitrage_trading: {
    title: "Spotmarkt-Optimierung",
    description: "Optimierung von PV-/Speicher-Vermarktung anhand von Day-Ahead-Preisen.",
  },
  energy_report: {
    title: "Energiebericht",
    description: "Detaillierter Energiebericht mit Kennzahlen und Handlungsempfehlungen.",
  },
  task_management: {
    title: "Aufgabenverwaltung",
    description: "Aufgabenlisten, Zuweisungen und Wartungspläne.",
  },
  remote_support: {
    title: "Premium-Fernwartung",
    description: "Priorisierter Remote-Support inkl. proaktivem Monitoring.",
  },
  floor_plans: {
    title: "Grundrisse & Räume",
    description: "Hinterlegung von Grundrissen mit räumlicher Sensor-Zuordnung.",
  },
  brighthub_api: {
    title: "BrightHub-API",
    description: "Datenabgleich mit BrightHub für Portfolio-Reporting.",
  },
  pv_forecast: {
    title: "PV-Prognose",
    description: "Standortbezogene Ertragsprognose für Photovoltaik-Anlagen.",
  },
  weather_normalization: {
    title: "Wetterbereinigung",
    description: "Wetterbereinigte Verbrauchsanalyse (Heizgradtage).",
  },
  energy_sharing: {
    title: "Energy Sharing",
    description: "Energiegemeinschaften mit Zuteilung und Mitgliederabrechnung.",
  },
  ppa: {
    title: "PPA-Verwaltung",
    description: "Strombezugsverträge (PPAs) mit Abrechnung und Herkunftsnachweisen.",
  },
  peak_shaving: {
    title: "Lastspitzenkappung",
    description: "Peak-Shaving mit Speicher- und Lastmanagement.",
  },
  charging_billing: {
    title: "Ladeabrechnung",
    description: "Abrechnung von Ladevorgängen inkl. Rechnungserstellung.",
  },
};

/** Gibt den DE-Titel eines Modul-Codes zurück; fällt auf den Code selbst zurück. */
export function moduleTitle(code: string): string {
  return SALES_MODULE_LABELS[code]?.title ?? code;
}

/** Gibt die DE-Beschreibung eines Modul-Codes zurück; leerer String, wenn unbekannt. */
export function moduleDescription(code: string): string {
  return SALES_MODULE_LABELS[code]?.description ?? "";
}
