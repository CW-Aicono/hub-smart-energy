import { fetchPowerSeriesAuto } from "@/lib/powerSeries";
import { downloadXlsxMulti } from "@/lib/exportUtils";

const fmtBerlin = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/**
 * Exportiert den Jahreslastgang (15-Minuten-Mittelwerte in W) für die
 * gewählten Zähler als Excel-Datei. Lädt in 7-Tage-Abschnitten, damit der
 * Server die 15-Minuten-Auflösung liefert.
 */
export async function exportYearLoadProfile(
  meters: { id: string; name: string }[],
  year: number,
  onProgress?: (pct: number) => void,
): Promise<number> {
  const start = new Date(Date.UTC(year, 0, 1) - 2 * 3600_000); // ab Neujahr Berliner Zeit (inkl. Puffer)
  const end = new Date(Math.min(Date.UTC(year + 1, 0, 1), Date.now()));
  const byBucket = new Map<string, Record<string, unknown>>();
  const total = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400_000)));
  let step = 0;
  for (let t = start.getTime(); t < end.getTime(); t += 7 * 86400_000) {
    const chunkEnd = new Date(Math.min(t + 7 * 86400_000, end.getTime()));
    const pts = await fetchPowerSeriesAuto(meters.map((m) => m.id), new Date(t), chunkEnd, 800);
    for (const p of pts) {
      const d = new Date(p.bucket);
      if (Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Berlin", year: "numeric" }).format(d)) !== year) continue;
      const key = d.toISOString();
      const row = byBucket.get(key) ?? { Zeitpunkt: fmtBerlin.format(d) };
      const m = meters.find((x) => x.id === p.meter_id);
      // Rohwerte liegen in kW vor → in W ausgeben
      if (m) row[`${m.name} (W)`] = Math.round(Number(p.power_avg) * 1000 * 10) / 10;
      byBucket.set(key, row);
    }
    onProgress?.(Math.round((++step / total) * 100));
  }
  const rows = [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
  if (rows.length) downloadXlsxMulti([{ name: `Lastgang ${year}`, data: rows }], `Lastgang_${year}_15min`);
  return rows.length;
}
