import type { Language } from "@/i18n/translations";

const S = {
  title: { de: "PV-Überschuss: Live & Analyse", en: "PV surplus: live & analysis", es: "Excedente FV: en vivo y análisis", nl: "PV-overschot: live & analyse" },
  live: { de: "Live-Energiefluss", en: "Live energy flow", es: "Flujo de energía en vivo", nl: "Live energiestroom" },
  decision: { de: "Regelentscheidung", en: "Control decision", es: "Decisión de control", nl: "Regelbeslissing" },
  analysis: { de: "Analyse", en: "Analysis", es: "Análisis", nl: "Analyse" },
  checks: { de: "Prüfung", en: "Check", es: "Comprobación", nl: "Controle" },
  pv: { de: "PV", en: "PV", es: "FV", nl: "PV" },
  grid: { de: "Netz", en: "Grid", es: "Red", nl: "Net" },
  building: { de: "Gebäude", en: "Building", es: "Edificio", nl: "Gebouw" },
  storage: { de: "Speicher", en: "Storage", es: "Batería", nl: "Opslag" },
  charging: { de: "Laden", en: "Charging", es: "Carga", nl: "Laden" },
  stale: { de: "veraltet", en: "stale", es: "desactualizado", nl: "verouderd" },
  noData: { de: "keine Daten", en: "no data", es: "sin datos", nl: "geen data" },
  ago: { de: "vor {m} min", en: "{m} min ago", es: "hace {m} min", nl: "{m} min geleden" },
  play: { de: "Abspielen", en: "Play", es: "Reproducir", nl: "Afspelen" },
  older: { de: "Älter", en: "Older", es: "Anterior", nl: "Ouder" },
  newer: { de: "Neuer", en: "Newer", es: "Más reciente", nl: "Nieuwer" },
  noDecisions: { de: "Noch keine Regelentscheidungen protokolliert.", en: "No control decisions logged yet.", es: "Aún no hay decisiones registradas.", nl: "Nog geen regelbeslissingen gelogd." },
  pvShare: { de: "PV-Anteil am Laden", en: "PV share of charging", es: "Cuota FV en la carga", nl: "PV-aandeel laden" },
  gridDuringEv: { de: "Netzbezug beim Laden", en: "Grid import while charging", es: "Consumo de red al cargar", nl: "Netafname tijdens laden" },
  exported: { de: "Eingespeist (ungenutzt)", en: "Exported (unused)", es: "Inyectado (sin usar)", nl: "Teruggeleverd (ongebruikt)" },
  evEnergy: { de: "Geladen", en: "Charged", es: "Cargado", nl: "Geladen" },
  today: { de: "Heute", en: "Today", es: "Hoy", nl: "Vandaag" },
  clickHint: { de: "Auf ein Symbol klicken für Details.", en: "Click a symbol for details.", es: "Haga clic en un símbolo para ver detalles.", nl: "Klik op een symbool voor details." },
  meter: { de: "Zähler", en: "Meter", es: "Contador", nl: "Meter" },
  lastValue: { de: "Letzter Wert", en: "Last value", es: "Último valor", nl: "Laatste waarde" },
  soc: { de: "Ladestand", en: "State of charge", es: "Estado de carga", nl: "Laadtoestand" },
  noConfig: { de: "PV-Überschussladen ist für diesen Standort noch nicht eingerichtet (Ladeinfrastruktur → Ladegruppen).", en: "PV surplus charging is not set up for this location yet (Charging → Groups).", es: "La carga con excedente FV aún no está configurada (Carga → Grupos).", nl: "PV-overschotladen is nog niet ingesteld (Laden → Groepen)." },
  estimate: { de: "Netzbezug während des Ladens wird zuerst dem Laden zugerechnet (vorsichtige Schätzung).", en: "Grid import while charging is attributed to charging first (conservative estimate).", es: "El consumo de red durante la carga se asigna primero a la carga (estimación prudente).", nl: "Netafname tijdens laden wordt eerst aan laden toegerekend (voorzichtige schatting)." },
  meterOnly: { de: "Modus: nur Bezugszähler (ohne Speicher)", en: "Mode: reference meter only (no storage)", es: "Modo: solo contador (sin batería)", nl: "Modus: alleen referentiemeter (zonder opslag)" },
  withStorage: { de: "Modus: mit Speicher", en: "Mode: with storage", es: "Modo: con batería", nl: "Modus: met opslag" },
  coupled: { de: "ELMI: Speicher gehört zur Ladestation, Entladen beim Laden immer erlaubt", en: "ELMI: storage belongs to the charger, discharging while charging always allowed", es: "ELMI: la batería pertenece al cargador, descarga siempre permitida al cargar", nl: "ELMI: opslag hoort bij laadstation, ontladen tijdens laden altijd toegestaan" },
} as const;

export type PvKey = keyof typeof S;

export function pvT(lang: Language | string, key: PvKey, vars?: Record<string, string | number>): string {
  const row = S[key] as Record<string, string>;
  let s = row[lang] ?? row.de;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
