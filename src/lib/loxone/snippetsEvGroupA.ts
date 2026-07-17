// AICONO Loxone-Snippets Gruppe A (E-Mobilität)
// Diese Snippets sind Loxone-Config-XML-Vorlagen für die vier EV-Templates.
// Sie können in Loxone Config als Referenz verwendet werden; die Namensschemata
// AICO_<TemplateKey>__<InstanceId> sind zwingend, damit `loxone-template-sync`
// (Action `discover`) die Bausteine automatisch erkennt.

export interface LoxoneSnippet {
  templateKey: string;
  title: string;
  filename: string;
  description: string;
  parameters: { name: string; type: string; description: string }[];
  xml: string;
}

const header = `<?xml version="1.0" encoding="utf-8"?>
<!--
  AICONO EMS – Loxone-Snippet
  Import-Hinweis: In Loxone Config als Vorlage einfügen. Namen der virtuellen
  Eingänge NICHT ändern – sonst schlägt Discovery + Push aus der Cloud fehl.
-->`;

const viBlock = (name: string, type: string, min: number, max: number, unit = "") => `  <VirtualInput Title="${name}" Type="${type}" MinVal="${min}" MaxVal="${max}" Unit="${unit}" />`;

export const EV_GROUP_A_SNIPPETS: LoxoneSnippet[] = [
  {
    templateKey: "AICO_WallboxDLM",
    title: "Wallbox Dynamisches Lastmanagement",
    filename: "AICO_WallboxDLM.xml",
    description:
      "Verteilt die verfügbare Hausanschluss-Leistung dynamisch auf mehrere Wallboxen. Priorisiert nach Konfiguration (FIFO, Priorität, Fair-Share).",
    parameters: [
      { name: "MaxCurrentA", type: "Analog", description: "Maximaler Hausanschluss-Strom pro Phase (A)" },
      { name: "ReservePctForHouse", type: "Analog", description: "Reserve für Hauslast in Prozent (0-100)" },
      { name: "Strategy", type: "Digital", description: "0=FIFO, 1=Priorität, 2=Fair-Share" },
      { name: "EnableDLM", type: "Digital", description: "Master-Schalter: 1=aktiv" },
    ],
    xml: `${header}
<AicoTemplate Key="AICO_WallboxDLM" Version="1.0.0" Instance="1">
${viBlock("AICO_WallboxDLM__1__MaxCurrentA", "Analog", 6, 63, "A")}
${viBlock("AICO_WallboxDLM__1__ReservePctForHouse", "Analog", 0, 100, "%")}
${viBlock("AICO_WallboxDLM__1__Strategy", "Analog", 0, 2, "")}
${viBlock("AICO_WallboxDLM__1__EnableDLM", "Digital", 0, 1, "")}
  <Comment><![CDATA[Verdrahten: Ausgänge -> Wallbox-Modbus-Bridge (Register set_current_a).]]></Comment>
</AicoTemplate>`,
  },
  {
    templateKey: "AICO_PVSurplus_EV",
    title: "PV-Überschuss-Laden",
    filename: "AICO_PVSurplus_EV.xml",
    description:
      "Lädt Elektrofahrzeuge bevorzugt aus PV-Überschuss. Umschaltbar zwischen Öko-, Hybrid- und Schnell-Modus.",
    parameters: [
      { name: "SurplusThresholdW", type: "Analog", description: "Mindest-Überschuss zum Starten (W)" },
      { name: "StopHysteresisW", type: "Analog", description: "Hysterese für Stopp (W)" },
      { name: "Mode", type: "Analog", description: "0=Öko, 1=Hybrid, 2=Schnell" },
      { name: "MinChargeA", type: "Analog", description: "Minimaler Ladestrom (A, üblicherweise 6)" },
    ],
    xml: `${header}
<AicoTemplate Key="AICO_PVSurplus_EV" Version="1.0.0" Instance="1">
${viBlock("AICO_PVSurplus_EV__1__SurplusThresholdW", "Analog", 500, 22000, "W")}
${viBlock("AICO_PVSurplus_EV__1__StopHysteresisW", "Analog", 0, 5000, "W")}
${viBlock("AICO_PVSurplus_EV__1__Mode", "Analog", 0, 2, "")}
${viBlock("AICO_PVSurplus_EV__1__MinChargeA", "Analog", 6, 16, "A")}
  <Comment><![CDATA[Eingang: PV-Überschuss aus Smartmeter (Einspeisung, positiv).]]></Comment>
</AicoTemplate>`,
  },
  {
    templateKey: "AICO_TariffCharging",
    title: "Ladefreigabe nach Tarif/Zeit",
    filename: "AICO_TariffCharging.xml",
    description:
      "Gibt Ladevorgänge nur in definierten Zeitfenstern oder unterhalb eines dynamischen Strompreis-Schwellenwertes frei.",
    parameters: [
      { name: "MaxCentPerKWh", type: "Analog", description: "Preis-Deckel in ct/kWh (dynamischer Tarif)" },
      { name: "AllowWindow1Start", type: "Analog", description: "Startzeit Fenster 1 (Minuten seit 00:00)" },
      { name: "AllowWindow1End", type: "Analog", description: "Endzeit Fenster 1 (Minuten seit 00:00)" },
      { name: "EnableTariffMode", type: "Digital", description: "1=Preis-Deckel aktiv, 0=nur Zeitfenster" },
    ],
    xml: `${header}
<AicoTemplate Key="AICO_TariffCharging" Version="1.0.0" Instance="1">
${viBlock("AICO_TariffCharging__1__MaxCentPerKWh", "Analog", 0, 200, "ct")}
${viBlock("AICO_TariffCharging__1__AllowWindow1Start", "Analog", 0, 1440, "min")}
${viBlock("AICO_TariffCharging__1__AllowWindow1End", "Analog", 0, 1440, "min")}
${viBlock("AICO_TariffCharging__1__EnableTariffMode", "Digital", 0, 1, "")}
  <Comment><![CDATA[Cloud pusht aktuellen Spotpreis in eigenes VI CurrentCentPerKWh.]]></Comment>
</AicoTemplate>`,
  },
  {
    templateKey: "AICO_GridProtect",
    title: "Netzanschluss-Cap",
    filename: "AICO_GridProtect.xml",
    description:
      "Harter Schutz gegen Überlast des Hausanschlusses: reduziert alle Wallboxen sofort, wenn Bezug einen Schwellenwert überschreitet.",
    parameters: [
      { name: "GridLimitKW", type: "Analog", description: "Maximale Bezugsleistung am Hausanschluss (kW)" },
      { name: "ReactionMs", type: "Analog", description: "Reaktionszeit in ms (typ. 500)" },
      { name: "EnableProtection", type: "Digital", description: "1=aktiv (sollte immer 1 sein)" },
    ],
    xml: `${header}
<AicoTemplate Key="AICO_GridProtect" Version="1.0.0" Instance="1">
${viBlock("AICO_GridProtect__1__GridLimitKW", "Analog", 3, 250, "kW")}
${viBlock("AICO_GridProtect__1__ReactionMs", "Analog", 100, 5000, "ms")}
${viBlock("AICO_GridProtect__1__EnableProtection", "Digital", 0, 1, "")}
  <Comment><![CDATA[Failsafe: wenn Cloud offline, bleibt Cap trotzdem aktiv.]]></Comment>
</AicoTemplate>`,
  },
];
