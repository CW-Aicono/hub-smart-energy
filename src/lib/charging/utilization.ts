/**
 * Aggregations für die Auslastungs-Heatmap (Wochentag × Stunde).
 * Verarbeitet `charging_sessions`-Datensätze.
 */
export interface SessionLike {
  start_time: string;
  stop_time: string | null;
  energy_kwh: number | null;
}

export type HeatmapMetric = "kwh" | "minutes" | "sessions";

/** 7 (Mo..So) × 24 Matrix mit aggregierten Werten. */
export type Heatmap = number[][];

/**
 * Liefert eine 7×24-Matrix. Index [0] = Montag, [6] = Sonntag.
 * Für `minutes` und `kwh` werden Sessions, die über Stunden- oder
 * Tagesgrenzen laufen, anteilig auf die jeweiligen Buckets verteilt.
 */
export function buildHeatmap(
  sessions: SessionLike[],
  metric: HeatmapMetric,
  from?: Date,
  to?: Date,
): Heatmap {
  const matrix: Heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const fromMs = from?.getTime() ?? -Infinity;
  const toMs = to?.getTime() ?? Infinity;

  for (const s of sessions) {
    const start = new Date(s.start_time).getTime();
    const end = s.stop_time
      ? new Date(s.stop_time).getTime()
      : start + 60_000; // offene Session: 1 Minute Defaultlänge
    if (!isFinite(start) || !isFinite(end) || end <= start) continue;

    const clampedStart = Math.max(start, fromMs);
    const clampedEnd = Math.min(end, toMs);
    if (clampedEnd <= clampedStart) continue;

    if (metric === "sessions") {
      // Session zählt im Bucket ihres Startzeitpunkts.
      if (start < fromMs || start > toMs) continue;
      const d = new Date(start);
      matrix[(d.getDay() + 6) % 7][d.getHours()] += 1;
      continue;
    }

    const totalMs = clampedEnd - clampedStart;
    const totalMin = totalMs / 60_000;
    const kwhPerMin =
      metric === "kwh" && totalMin > 0
        ? (Number(s.energy_kwh ?? 0) * (totalMs / (end - start))) / totalMin
        : 0;

    // Pro Stunde aufteilen
    let cursor = clampedStart;
    while (cursor < clampedEnd) {
      const d = new Date(cursor);
      const hourEnd = new Date(d);
      hourEnd.setMinutes(60, 0, 0);
      const sliceEnd = Math.min(hourEnd.getTime(), clampedEnd);
      const sliceMin = (sliceEnd - cursor) / 60_000;
      const dow = (d.getDay() + 6) % 7;
      const hr = d.getHours();
      matrix[dow][hr] +=
        metric === "minutes" ? sliceMin : sliceMin * kwhPerMin;
      cursor = sliceEnd;
    }
  }
  return matrix;
}

export function heatmapMax(m: Heatmap): number {
  let max = 0;
  for (const row of m) for (const v of row) if (v > max) max = v;
  return max;
}
