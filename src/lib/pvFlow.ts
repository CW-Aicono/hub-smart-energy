// Reine Rechenlogik für die PV-Überschuss-Ansichten (Live-Fluss, Analyse, Prüfung).
// Vorzeichen: Netz + Bezug / − Einspeisung, PV immer positiv,
// Speicher + laden / − entladen, Ladepunkte positiv.

export const STALE_AFTER_MIN = 10;

export interface FlowInput {
  gridKw: number | null;
  pvKw: number | null;
  storageKw: number | null;
  evKw: Record<string, number | null>;
}

export interface FlowEdges {
  pvToHub: number;
  gridToHub: number; // + Bezug, − Einspeisung
  hubToStorage: number; // + laden, − entladen
  hubToEv: Record<string, number>;
  buildingKw: number | null;
}

export function deriveFlows(i: FlowInput): FlowEdges {
  const pv = Math.max(0, Math.abs(i.pvKw ?? 0));
  const grid = i.gridKw ?? 0;
  const storage = i.storageKw ?? 0;
  const hubToEv: Record<string, number> = {};
  let ev = 0;
  for (const [id, v] of Object.entries(i.evKw)) {
    const kw = Math.max(0, v ?? 0);
    hubToEv[id] = kw;
    ev += kw;
  }
  // Gebäude = alles was reinkommt minus Speicher und Laden.
  const building = i.gridKw === null ? null : Math.max(0, pv + grid - storage - ev);
  return { pvToHub: pv, gridToHub: grid, hubToStorage: storage, hubToEv, buildingKw: building };
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.round((now - new Date(iso).getTime()) / 60000);
}

export function isStale(iso: string | null | undefined, now = Date.now()): boolean {
  const m = minutesSince(iso, now);
  return m === null || m > STALE_AFTER_MIN;
}

export interface SeriesPoint {
  t: string;
  gridKw: number | null;
  pvKw: number | null;
  evKw: number | null;
  storageKw: number | null;
}

export interface PvKpis {
  evKwh: number;
  gridDuringEvKwh: number;
  pvShareOfEvPct: number | null;
  exportKwh: number;
}

/**
 * 5-Minuten-Kennzahlen. Netzbezug während des Ladens wird zuerst dem Laden
 * zugerechnet (vorsichtige Schätzung des PV-Anteils).
 */
export function computeKpis(points: SeriesPoint[], bucketMin = 5): PvKpis {
  const h = bucketMin / 60;
  let ev = 0, gridDuringEv = 0, exp = 0;
  for (const p of points) {
    const e = Math.max(0, p.evKw ?? 0);
    const g = p.gridKw ?? 0;
    ev += e * h;
    if (e > 0 && g > 0) gridDuringEv += Math.min(e, g) * h;
    if (g < 0) exp += -g * h;
  }
  return {
    evKwh: round2(ev),
    gridDuringEvKwh: round2(gridDuringEv),
    pvShareOfEvPct: ev > 0 ? Math.round(((ev - gridDuringEv) / ev) * 100) : null,
    exportKwh: round2(exp),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const fmtKw = (kw: number | null | undefined, digits = 1) =>
  kw === null || kw === undefined ? "–" : `${kw.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} kW`;

export const fmtW = (w: number) => `${Math.round(w).toLocaleString("de-DE")} W`;
