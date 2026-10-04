import { z } from "zod";

/**
 * Zustand der Energieanalyse. Wird komplett (ohne Messdaten) als
 * base64url-codiertes JSON im Suchparameter `?a=` abgelegt, damit eine
 * Analyse per Link geteilt werden kann. Der Link enthält nur Einstellungen;
 * Daten werden beim Öffnen mit den Rechten des jeweiligen Nutzers geladen.
 */
export const RESOLUTIONS = ["auto", "5min", "hour", "day", "week", "month"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const PRESETS = ["today", "yesterday", "7d", "30d", "month", "lastMonth", "year", "lastYear", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

const SeriesSchema = z.object({
  id: z.string().uuid(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  type: z.enum(["line", "bar", "area"]).optional(),
});

export const AnalysisStateSchema = z.object({
  v: z.literal(1).default(1),
  series: z.array(SeriesSchema).max(20).default([]),
  preset: z.enum(PRESETS).default("7d"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  res: z.enum(RESOLUTIONS).default("auto"),
  /** "energy" = kWh je Intervall, "power" = mittlere Leistung kW */
  quantity: z.enum(["energy", "power"]).default("energy"),
  stacked: z.boolean().default(false),
  view: z.enum(["chart", "heatmap", "duration"]).default("chart"),
  /** Vergleich: none | prev (Vorperiode) | year (Vorjahr) | custom (freier Start) */
  cmp: z.enum(["none", "prev", "year", "custom"]).default("none"),
  cmpFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Bezug: none | area (je m² NGF) | hdd (je Heizgradtag) */
  norm: z.enum(["none", "area", "hdd"]).default("none"),
});

export type AnalysisState = z.infer<typeof AnalysisStateSchema>;

export const DEFAULT_STATE: AnalysisState = AnalysisStateSchema.parse({});

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeAnalysisState(state: AnalysisState): string {
  return toB64Url(JSON.stringify(state));
}

export function decodeAnalysisState(raw: string | null | undefined): AnalysisState {
  if (!raw || raw.length > 4000) return DEFAULT_STATE;
  try {
    const parsed = AnalysisStateSchema.safeParse(JSON.parse(fromB64Url(raw)));
    return parsed.success ? parsed.data : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export function buildAnalysisUrl(state: Partial<AnalysisState>): string {
  const full = AnalysisStateSchema.parse(state);
  return `/analytics-studio/analyse?a=${encodeAnalysisState(full)}`;
}

/** Zeitraum aus Schnellwahl bzw. freien Datumsangaben (lokale Zeit). */
export function resolveRange(state: AnalysisState, now = new Date()): { from: Date; to: Date } {
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = sod(now);
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (state.preset) {
    case "today": return { from: today, to: addDays(today, 1) };
    case "yesterday": return { from: addDays(today, -1), to: today };
    case "7d": return { from: addDays(today, -6), to: addDays(today, 1) };
    case "30d": return { from: addDays(today, -29), to: addDays(today, 1) };
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "lastMonth": return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
    case "lastYear": return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 1) };
    case "custom": {
      const f = state.from ? new Date(`${state.from}T00:00:00`) : addDays(today, -6);
      const t = state.to ? addDays(new Date(`${state.to}T00:00:00`), 1) : addDays(today, 1);
      return t > f ? { from: f, to: t } : { from: f, to: addDays(f, 1) };
    }
  }
}

/** Vergleichszeitraum gleicher Länge. */
export function resolveCompareRange(state: AnalysisState, range: { from: Date; to: Date }): { from: Date; to: Date } | null {
  const len = range.to.getTime() - range.from.getTime();
  if (state.cmp === "prev") return { from: new Date(range.from.getTime() - len), to: range.from };
  if (state.cmp === "year") {
    const f = new Date(range.from); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(range.to); t.setFullYear(t.getFullYear() - 1);
    return { from: f, to: t };
  }
  if (state.cmp === "custom" && state.cmpFrom) {
    const f = new Date(`${state.cmpFrom}T00:00:00`);
    return { from: f, to: new Date(f.getTime() + len) };
  }
  return null;
}

export function autoResolution(range: { from: Date; to: Date }): Exclude<Resolution, "auto"> {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 2) return "5min";
  if (days <= 14) return "hour";
  if (days <= 92) return "day";
  if (days <= 400) return "week";
  return "month";
}
