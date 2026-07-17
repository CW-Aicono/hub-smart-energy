// AICONO Loxone-Snippet-Katalog (alle Gruppen A–F)
// Namenskonvention: AICO_<TemplateKey>__<Instance>__<Parameter>
// Discovery-Endpoint (Edge Function `loxone-template-sync`) matcht auf das Präfix.

export interface SnippetParameter {
  name: string;
  type: "Analog" | "Digital";
  description: string;
}

export interface LoxoneSnippet {
  templateKey: string;
  title: string;
  filename: string;
  description: string;
  parameters: SnippetParameter[];
  xml: string;
}

export interface SnippetGroup {
  key: string;         // "A" | "B" ...
  label: string;       // "Gruppe A – E-Mobilität"
  categories: string[]; // registry category values
  zipName: string;
  snippets: LoxoneSnippet[];
}

const header = `<?xml version="1.0" encoding="utf-8"?>
<!--
  AICONO EMS – Loxone-Snippet
  Import-Hinweis: In Loxone Config als Vorlage einfügen. Namen der virtuellen
  Eingänge NICHT ändern – sonst schlägt Discovery + Push aus der Cloud fehl.
-->`;

const viBlock = (name: string, type: string, min: number, max: number, unit = "") =>
  `  <VirtualInput Title="${name}" Type="${type}" MinVal="${min}" MaxVal="${max}" Unit="${unit}" />`;

/** Helper: build one snippet from a compact spec */
function make(
  templateKey: string,
  title: string,
  description: string,
  params: Array<SnippetParameter & { min: number; max: number; unit?: string }>,
  comment: string,
): LoxoneSnippet {
  const parameters = params.map(({ name, type, description }) => ({ name, type, description }));
  const vis = params
    .map((p) => viBlock(`${templateKey}__1__${p.name}`, p.type, p.min, p.max, p.unit ?? ""))
    .join("\n");
  const xml = `${header}
<AicoTemplate Key="${templateKey}" Version="1.0.0" Instance="1">
${vis}
  <Comment><![CDATA[${comment}]]></Comment>
</AicoTemplate>`;
  return {
    templateKey,
    title,
    filename: `${templateKey}.xml`,
    description,
    parameters,
    xml,
  };
}

// ── Gruppe A – E-Mobilität ──
const EV_GROUP_A: LoxoneSnippet[] = [
  make(
    "AICO_WallboxDLM",
    "Wallbox Dynamisches Lastmanagement",
    "Verteilt die verfügbare Hausanschluss-Leistung dynamisch auf mehrere Wallboxen. Priorisiert nach Konfiguration (FIFO, Priorität, Fair-Share).",
    [
      { name: "MaxCurrentA", type: "Analog", min: 6, max: 63, unit: "A", description: "Maximaler Hausanschluss-Strom pro Phase (A)" },
      { name: "ReservePctForHouse", type: "Analog", min: 0, max: 100, unit: "%", description: "Reserve für Hauslast in Prozent (0-100)" },
      { name: "Strategy", type: "Analog", min: 0, max: 2, description: "0=FIFO, 1=Priorität, 2=Fair-Share" },
      { name: "EnableDLM", type: "Digital", min: 0, max: 1, description: "Master-Schalter: 1=aktiv" },
    ],
    "Verdrahten: Ausgänge -> Wallbox-Modbus-Bridge (Register set_current_a).",
  ),
  make(
    "AICO_PVSurplus_EV",
    "PV-Überschuss-Laden",
    "Lädt Elektrofahrzeuge bevorzugt aus PV-Überschuss. Umschaltbar zwischen Öko-, Hybrid- und Schnell-Modus.",
    [
      { name: "SurplusThresholdW", type: "Analog", min: 500, max: 22000, unit: "W", description: "Mindest-Überschuss zum Starten (W)" },
      { name: "StopHysteresisW", type: "Analog", min: 0, max: 5000, unit: "W", description: "Hysterese für Stopp (W)" },
      { name: "Mode", type: "Analog", min: 0, max: 2, description: "0=Öko, 1=Hybrid, 2=Schnell" },
      { name: "MinChargeA", type: "Analog", min: 6, max: 16, unit: "A", description: "Minimaler Ladestrom (A, üblicherweise 6)" },
    ],
    "Eingang: PV-Überschuss aus Smartmeter (Einspeisung, positiv).",
  ),
  make(
    "AICO_TariffCharging",
    "Ladefreigabe nach Tarif/Zeit",
    "Gibt Ladevorgänge nur in definierten Zeitfenstern oder unterhalb eines dynamischen Strompreis-Schwellenwertes frei.",
    [
      { name: "MaxCentPerKWh", type: "Analog", min: 0, max: 200, unit: "ct", description: "Preis-Deckel in ct/kWh (dynamischer Tarif)" },
      { name: "AllowWindow1Start", type: "Analog", min: 0, max: 1440, unit: "min", description: "Startzeit Fenster 1 (Minuten seit 00:00)" },
      { name: "AllowWindow1End", type: "Analog", min: 0, max: 1440, unit: "min", description: "Endzeit Fenster 1 (Minuten seit 00:00)" },
      { name: "EnableTariffMode", type: "Digital", min: 0, max: 1, description: "1=Preis-Deckel aktiv, 0=nur Zeitfenster" },
    ],
    "Cloud pusht aktuellen Spotpreis in eigenes VI CurrentCentPerKWh.",
  ),
  make(
    "AICO_GridProtect",
    "Netzanschluss-Cap",
    "Harter Schutz gegen Überlast des Hausanschlusses: reduziert alle Wallboxen sofort, wenn Bezug einen Schwellenwert überschreitet.",
    [
      { name: "GridLimitKW", type: "Analog", min: 3, max: 250, unit: "kW", description: "Maximale Bezugsleistung am Hausanschluss (kW)" },
      { name: "ReactionMs", type: "Analog", min: 100, max: 5000, unit: "ms", description: "Reaktionszeit in ms (typ. 500)" },
      { name: "EnableProtection", type: "Digital", min: 0, max: 1, description: "1=aktiv (sollte immer 1 sein)" },
    ],
    "Failsafe: wenn Cloud offline, bleibt Cap trotzdem aktiv.",
  ),
];

// ── Gruppe B – Speicher & PV ──
const STORAGE_PV_GROUP_B: LoxoneSnippet[] = [
  make(
    "AICO_PeakShaving",
    "Peak-Shaving Speicher",
    "Kappt Lastspitzen am Hausanschluss durch Entladen des Speichers oberhalb eines Schwellenwertes.",
    [
      { name: "TargetPeakKW", type: "Analog", min: 3, max: 250, unit: "kW", description: "Ziel-Peak (kW), oberhalb dessen entladen wird" },
      { name: "MinSocPct", type: "Analog", min: 5, max: 95, unit: "%", description: "Speicher-Untergrenze (SOC %)" },
      { name: "DischargePowerKW", type: "Analog", min: 1, max: 100, unit: "kW", description: "Maximale Entladeleistung (kW)" },
      { name: "EnablePeakShaving", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Eingang: aktuelle Bezugsleistung. Ausgang: Sollleistung Speicher-Wechselrichter.",
  ),
  make(
    "AICO_StorageDispatch",
    "Speicher-Fahrplan",
    "Zeit-/preisgesteuerter Lade-/Entlade-Fahrplan für Heim- oder Gewerbespeicher.",
    [
      { name: "ChargeWindowStart", type: "Analog", min: 0, max: 1440, unit: "min", description: "Startzeit Ladefenster (Minuten seit 00:00)" },
      { name: "ChargeWindowEnd", type: "Analog", min: 0, max: 1440, unit: "min", description: "Endzeit Ladefenster (Minuten seit 00:00)" },
      { name: "TargetSocPct", type: "Analog", min: 10, max: 100, unit: "%", description: "Ziel-SOC am Ende des Ladefensters" },
      { name: "Mode", type: "Analog", min: 0, max: 3, description: "0=Auto, 1=Nur Laden, 2=Nur Entladen, 3=Idle" },
    ],
    "Ideal für dynamische Tarife (nachts günstig laden, tags entladen).",
  ),
  make(
    "AICO_PVCurtailment",
    "PV-Abregelung",
    "Reduziert die PV-Einspeisung auf den vom Netzbetreiber vorgegebenen Anteil (z. B. 70 %-Regel).",
    [
      { name: "MaxFeedInPct", type: "Analog", min: 0, max: 100, unit: "%", description: "Maximaler Einspeise-Anteil der PV-Anlagen-Nennleistung (%)" },
      { name: "PvNominalKWp", type: "Analog", min: 1, max: 500, unit: "kWp", description: "PV-Nennleistung (kWp)" },
      { name: "EnableCurtailment", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Ausgang: Sollwert an PV-Wechselrichter (Modbus / Fronius / SMA).",
  ),
  make(
    "AICO_SelfConsumption",
    "Eigenverbrauchs-Optimierung",
    "Priorisiert Verbraucher (Wärmepumpe, Wallbox, Boiler), wenn PV-Überschuss verfügbar ist.",
    [
      { name: "SurplusStartW", type: "Analog", min: 200, max: 20000, unit: "W", description: "Schwelle zum Starten (W)" },
      { name: "SurplusStopW", type: "Analog", min: 100, max: 20000, unit: "W", description: "Schwelle zum Stoppen (W, Hysterese)" },
      { name: "Priority", type: "Analog", min: 0, max: 3, description: "0=Wärmepumpe, 1=Boiler, 2=Wallbox, 3=Speicher" },
      { name: "EnableOptimizer", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Ausgänge: Freigaben pro Verbraucher (Boolean).",
  ),
];

// ── Gruppe C – Heizung / Wärmepumpe ──
const HEATING_GROUP_C: LoxoneSnippet[] = [
  make(
    "AICO_DHWSchedule",
    "Warmwasser-Zeitplan",
    "Legt Aufheizfenster für den Warmwasserspeicher fest (Legionellen, Komfort, Sparbetrieb).",
    [
      { name: "SetpointC", type: "Analog", min: 40, max: 70, unit: "°C", description: "Zieltemperatur (°C)" },
      { name: "WindowStart", type: "Analog", min: 0, max: 1440, unit: "min", description: "Aufheizfenster Start (Minuten)" },
      { name: "WindowEnd", type: "Analog", min: 0, max: 1440, unit: "min", description: "Aufheizfenster Ende (Minuten)" },
      { name: "LegionellaWeekday", type: "Analog", min: 1, max: 7, description: "Wochentag Legionellen-Aufheizung (1=Mo)" },
    ],
    "Ausgang: Freigabe an Wärmepumpe / Heizstab.",
  ),
  make(
    "AICO_HeatingLimit",
    "Heizgrenze",
    "Deaktiviert die Heizung ab einer Außentemperaturschwelle (gleitender Mittelwert).",
    [
      { name: "OutdoorLimitC", type: "Analog", min: 5, max: 25, unit: "°C", description: "Außentemperatur-Grenze (°C)" },
      { name: "AveragingHours", type: "Analog", min: 1, max: 48, unit: "h", description: "Zeitfenster gleitender Mittelwert (h)" },
      { name: "EnableHeatingLimit", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Ausgang: Freigabe Heizkreis (Boolean).",
  ),
  make(
    "AICO_HeatpumpSGReady",
    "Wärmepumpe SG-Ready",
    "Steuert die Wärmepumpe über die 4 SG-Ready-Zustände (Sperre / Normal / Anhebung / Zwangslauf).",
    [
      { name: "Mode", type: "Analog", min: 1, max: 4, description: "1=Sperre, 2=Normal, 3=Anhebung, 4=Zwangslauf" },
      { name: "MinRuntimeMin", type: "Analog", min: 0, max: 240, unit: "min", description: "Minimale Laufzeit pro Zustand (min)" },
      { name: "AutoBySurplus", type: "Digital", min: 0, max: 1, description: "1=Modus automatisch aus PV-Überschuss ableiten" },
    ],
    "Ausgänge: Relais SG1 + SG2 gemäß Herstellervorgabe verdrahten.",
  ),
  make(
    "AICO_NightSetback",
    "Nachtabsenkung",
    "Reduziert Raumtemperatur-Sollwerte in definierten Zeitfenstern.",
    [
      { name: "SetbackK", type: "Analog", min: 0, max: 10, unit: "K", description: "Absenkung (Kelvin)" },
      { name: "StartMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "Start (Minuten seit 00:00)" },
      { name: "EndMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "Ende (Minuten seit 00:00)" },
      { name: "EnableSetback", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Wirkt auf alle Raum-Regler, die auf den Absenkungs-Bus hören.",
  ),
];

// ── Gruppe D – Komfort & Beschattung ──
const COMFORT_GROUP_D: LoxoneSnippet[] = [
  make(
    "AICO_ShadingSummer",
    "Sommer-Beschattung",
    "Fährt Jalousien bei hoher Einstrahlung + Innentemperatur automatisch herunter.",
    [
      { name: "IrradianceThresholdWm2", type: "Analog", min: 100, max: 1200, unit: "W/m²", description: "Einstrahlungs-Schwelle (W/m²)" },
      { name: "IndoorTempC", type: "Analog", min: 18, max: 30, unit: "°C", description: "Innentemperatur-Schwelle (°C)" },
      { name: "ShadingPositionPct", type: "Analog", min: 0, max: 100, unit: "%", description: "Zielposition Jalousie (%)" },
      { name: "EnableShading", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Priorität: Wind/Sturm-Schutz überstimmt Beschattung immer.",
  ),
  make(
    "AICO_WindStormProtect",
    "Wind-/Sturmschutz",
    "Fährt Jalousien / Markisen bei Wind über Schwellenwert sofort ein.",
    [
      { name: "WindLimitKmh", type: "Analog", min: 10, max: 120, unit: "km/h", description: "Wind-Schwelle (km/h)" },
      { name: "HoldMinutes", type: "Analog", min: 1, max: 240, unit: "min", description: "Nachlaufzeit nach Unterschreitung (min)" },
      { name: "EnableProtection", type: "Digital", min: 0, max: 1, description: "1=aktiv (empfohlen: dauerhaft an)" },
    ],
    "Höchste Priorität – überstimmt Beschattung und manuelle Bedienung.",
  ),
  make(
    "AICO_PresenceLighting",
    "Präsenz-Beleuchtung",
    "Schaltet Licht bei Präsenz-Erkennung, nur wenn Umgebungshelligkeit unter Schwelle.",
    [
      { name: "LuxThreshold", type: "Analog", min: 0, max: 2000, unit: "lx", description: "Helligkeits-Schwelle (Lux)" },
      { name: "HoldSeconds", type: "Analog", min: 10, max: 3600, unit: "s", description: "Nachlaufzeit (s)" },
      { name: "DimLevelPct", type: "Analog", min: 10, max: 100, unit: "%", description: "Dimmwert (%)" },
      { name: "EnableAuto", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Kombiniert Präsenzmelder + Helligkeitssensor.",
  ),
  make(
    "AICO_VentilationCO2",
    "CO₂-geführte Lüftung",
    "Regelt die Lüftungsstufe abhängig vom CO₂-Wert im Raum.",
    [
      { name: "TargetPpm", type: "Analog", min: 400, max: 2000, unit: "ppm", description: "Ziel-CO₂-Wert (ppm)" },
      { name: "MaxStage", type: "Analog", min: 1, max: 4, description: "Maximale Lüftungsstufe" },
      { name: "MinStage", type: "Analog", min: 0, max: 3, description: "Minimale Lüftungsstufe" },
      { name: "EnableAuto", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Ausgang: Stufenwahl an KWL-Anlage (0-10V oder Modbus).",
  ),
];

// ── Gruppe E – Sicherheit ──
const SAFETY_GROUP_E: LoxoneSnippet[] = [
  make(
    "AICO_HolidayMode",
    "Urlaubs-Modus",
    "Simuliert Anwesenheit (Licht/Rollos zu Zufallszeiten), reduziert Heizung, aktiviert Alarm.",
    [
      { name: "StartDate", type: "Analog", min: 0, max: 99991231, description: "Startdatum (JJJJMMTT)" },
      { name: "EndDate", type: "Analog", min: 0, max: 99991231, description: "Enddatum (JJJJMMTT)" },
      { name: "TempSetbackK", type: "Analog", min: 0, max: 10, unit: "K", description: "Temperatur-Absenkung (K)" },
      { name: "EnableHoliday", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Cloud kann Start/Ende per Kalender pushen.",
  ),
  make(
    "AICO_LeakageCutoff",
    "Wasser-Leckage-Notaus",
    "Schließt das Hauptventil sofort, wenn ein Leckage-Sensor auslöst.",
    [
      { name: "ReactionMs", type: "Analog", min: 100, max: 5000, unit: "ms", description: "Reaktionszeit (ms)" },
      { name: "AutoResetHours", type: "Analog", min: 0, max: 168, unit: "h", description: "Automatischer Reset nach (h, 0=aus)" },
      { name: "EnableCutoff", type: "Digital", min: 0, max: 1, description: "1=aktiv (empfohlen dauerhaft)" },
    ],
    "Ausgang: Motorventil Hauptwasser. Failsafe: bleibt aktiv, wenn Cloud offline.",
  ),
  make(
    "AICO_PowerFailWatchdog",
    "Netzausfall-Wächter",
    "Meldet Netzausfälle, priorisiert USV-Verbraucher und startet Sequenz nach Rückkehr.",
    [
      { name: "MinOutageSec", type: "Analog", min: 1, max: 3600, unit: "s", description: "Mindest-Ausfalldauer für Meldung (s)" },
      { name: "RestartDelaySec", type: "Analog", min: 0, max: 600, unit: "s", description: "Verzögerung Wieder-Einschalten (s)" },
      { name: "EnableWatchdog", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Kombiniert Netzspannungs-Sensor mit USV-Zustand.",
  ),
  make(
    "AICO_TariffSignal",
    "Tarif-Signal (HT/NT)",
    "Erzeugt HT/NT-Signal aus Zeitplan oder externem Rundsteuer-Signal für nachgelagerte Verbraucher.",
    [
      { name: "NtStartMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "NT-Beginn (Minuten seit 00:00)" },
      { name: "NtEndMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "NT-Ende (Minuten seit 00:00)" },
      { name: "UseExternal", type: "Digital", min: 0, max: 1, description: "1=externes Rundsteuer-Signal verwenden" },
      { name: "EnableSignal", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Ausgang: Boolean HT/NT, wird an Boiler/Speicher/Wallbox verteilt.",
  ),
];

// ── Gruppe F – Baukasten (generisch) ──
const GENERIC_GROUP_F: LoxoneSnippet[] = [
  make(
    "AICO_Formula",
    "Formel-Baukasten",
    "Freie Formel mit bis zu 4 Eingängen (A..D) und einem Analog-Ausgang. Formel wird aus der Cloud gepusht.",
    [
      { name: "InputA", type: "Analog", min: -1000000, max: 1000000, description: "Eingang A" },
      { name: "InputB", type: "Analog", min: -1000000, max: 1000000, description: "Eingang B" },
      { name: "InputC", type: "Analog", min: -1000000, max: 1000000, description: "Eingang C" },
      { name: "InputD", type: "Analog", min: -1000000, max: 1000000, description: "Eingang D" },
    ],
    "Cloud pusht Formel-String in VI FormulaText. Ergebnis: FormulaOut.",
  ),
  make(
    "AICO_Schedule8",
    "8-Zeit-Schaltuhr",
    "Bis zu 8 Zeit-Slots pro Tag mit Wochentag-Maske. Ideal für generische Verbraucher.",
    [
      { name: "Slot1StartMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "Slot 1 Start (Minuten)" },
      { name: "Slot1EndMin", type: "Analog", min: 0, max: 1440, unit: "min", description: "Slot 1 Ende (Minuten)" },
      { name: "WeekdayMask", type: "Analog", min: 0, max: 127, description: "Wochentag-Bitmaske (1=Mo, 64=So)" },
      { name: "EnableSchedule", type: "Digital", min: 0, max: 1, description: "1=aktiv" },
    ],
    "Weitere Slots per Cloud-Push (Slot2..Slot8) konfigurierbar.",
  ),
  make(
    "AICO_StatusMirror",
    "Status-Spiegel",
    "Spiegelt einen beliebigen Miniserver-Status als AICO-Sensor in die Cloud (Read-Only).",
    [
      { name: "MirrorValue", type: "Analog", min: -1000000, max: 1000000, description: "Zu spiegelnder Wert" },
      { name: "UpdateIntervalSec", type: "Analog", min: 1, max: 3600, unit: "s", description: "Sende-Intervall (s)" },
    ],
    "Wird in der Cloud als virtueller Sensor angelegt.",
  ),
  make(
    "AICO_ThresholdControl",
    "Schwellwert-Schalter",
    "Generischer Zweipunkt-Regler (Ein/Aus) mit Hysterese für beliebige Analogwerte.",
    [
      { name: "InputValue", type: "Analog", min: -1000000, max: 1000000, description: "Aktueller Wert" },
      { name: "OnThreshold", type: "Analog", min: -1000000, max: 1000000, description: "Einschalt-Schwelle" },
      { name: "OffThreshold", type: "Analog", min: -1000000, max: 1000000, description: "Ausschalt-Schwelle (Hysterese)" },
      { name: "Invert", type: "Digital", min: 0, max: 1, description: "1=Logik invertieren" },
    ],
    "Ausgang: Boolean, kann direkt auf Relais/Aktor gelegt werden.",
  ),
];

export const SNIPPET_GROUPS: SnippetGroup[] = [
  { key: "A", label: "Gruppe A – E-Mobilität", categories: ["ev"], zipName: "AICONO_Loxone_EV_GroupA.zip", snippets: EV_GROUP_A },
  { key: "B", label: "Gruppe B – Speicher & PV", categories: ["storage", "pv"], zipName: "AICONO_Loxone_StoragePV_GroupB.zip", snippets: STORAGE_PV_GROUP_B },
  { key: "C", label: "Gruppe C – Heizung & Wärmepumpe", categories: ["heating"], zipName: "AICONO_Loxone_Heating_GroupC.zip", snippets: HEATING_GROUP_C },
  { key: "D", label: "Gruppe D – Komfort & Beschattung", categories: ["comfort"], zipName: "AICONO_Loxone_Comfort_GroupD.zip", snippets: COMFORT_GROUP_D },
  { key: "E", label: "Gruppe E – Sicherheit", categories: ["safety"], zipName: "AICONO_Loxone_Safety_GroupE.zip", snippets: SAFETY_GROUP_E },
  { key: "F", label: "Gruppe F – Baukasten", categories: ["generic"], zipName: "AICONO_Loxone_Toolkit_GroupF.zip", snippets: GENERIC_GROUP_F },
];

export const ALL_SNIPPETS: LoxoneSnippet[] = SNIPPET_GROUPS.flatMap((g) => g.snippets);
export const SNIPPET_BY_KEY: Record<string, LoxoneSnippet> = Object.fromEntries(
  ALL_SNIPPETS.map((s) => [s.templateKey, s]),
);
export const GROUP_BY_TEMPLATE_KEY: Record<string, SnippetGroup> = Object.fromEntries(
  SNIPPET_GROUPS.flatMap((g) => g.snippets.map((s) => [s.templateKey, g])),
);
