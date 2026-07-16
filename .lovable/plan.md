## Echte Ursache (mit DB-Daten verifiziert)

Der SOC hat in der Cloud-DB volle 24 h Historie (96 Zeilen alle 15 Min, 70–100 %). Trotzdem endet die SOC-Linie im Chart bei ~02:00 Uhr.

Grund: In `src/components/dashboard/EnergyFlowMonitor.tsx` (Zeile ~1443) werden SOC- und Leistungs-Punkte per Map über **exakten Millisekunden-Timestamp** zusammengeführt. Aus der DB kommen die beiden Reihen aber ~500 ms versetzt (Power 00:00:27.677, SOC 00:00:28.147, usw.). Dadurch entsteht für jeden Zeitpunkt ein Datensatz mit **nur `kw` oder nur `soc`**, nie beides. Die SOC-`<Line>` läuft mit `connectNulls={false}` → Recharts unterbricht sie bei jedem `null`-Nachbarn.

Ergebnis:
- Zeitfenster mit nur SOC-Punkten (vor 02:00 CEST, bevor Power-Ingest startet) → SOC-Linie sichtbar.
- Ab 02:00 wechseln sich SOC- und Power-Punkte ab → jeder SOC-Punkt ist von `null` umgeben → **SOC verschwindet**.

Punkt 3 (Einspeisung negativ) funktioniert im aktuellen Code bereits (Screenshot 1 zeigt grüne Balken unter der X-Achse) — hier keine weitere Änderung nötig.

## Fix

Alles in `src/components/dashboard/EnergyFlowMonitor.tsx`, nur Frontend.

### 1) Merge auf gemeinsame Zeit-Buckets statt exakter Millisekunden

`mergedSeries` (~Zeile 1443) neu: SOC- und Power-Werte auf einen gemeinsamen Bucket runden, sodass "nahe" Zeitpunkte einen gemeinsamen Datensatz erzeugen.

```ts
const bucketMs =
  range === "1h"  ? 60_000            // 1 min
  : range === "24h" ? 5 * 60_000      // 5 min
  : range === "7d"  ? 15 * 60_000     // 15 min
  : 60 * 60_000;                      // 1 h

const map = new Map<number, { t: number; kw: number | null; soc: number | null }>();
const put = (rawT: number, patch: Partial<{ kw: number; soc: number }>) => {
  const key = Math.round(rawT / bucketMs) * bucketMs;
  const cur = map.get(key) ?? { t: key, kw: null, soc: null };
  if (patch.kw  != null) cur.kw  = patch.kw;
  if (patch.soc != null) cur.soc = patch.soc;
  map.set(key, cur);
};
for (const p of series)    put(p.t, { kw:  p.kw  });
for (const s of socSeries) put(s.t, { soc: s.soc });
const mergedSeries = Array.from(map.values()).sort((a, b) => a.t - b.t);
```

Damit stehen SOC und Power am gleichen X-Wert und die Chart-Achse ist implizit synchron.

### 2) SOC-Linie `connectNulls={true}`

Kleinere Restlücken (z. B. Bucket ohne SOC, aber mit Power) sollen die SOC-Linie nicht unterbrechen. In der `<Line dataKey="soc" …>` (~Zeile 1786):
```
connectNulls={true}
```
Für die Power-`<Area>` bleibt `connectNulls` wie bisher — echte Power-Lücken sollen sichtbar bleiben.

### 3) Gap-Hint neu bewerten

`firstPowerTs`/`firstSocTs` (~Zeile 1533/1534) auf die neuen `mergedSeries` beziehen: erster Bucket mit `kw != null` bzw. `soc != null`. Damit stimmt der Hinweistext („SOC ab … · Leistung ab …") wieder mit dem gezeichneten Chart überein.

### 4) Verifikation

- In Lovable-Preview den Speicher-Node öffnen → SOC-Linie muss über 24 h durchgehen und bei ~100 % enden (statt bei 02:00 abbrechen).
- 7-Tage-Ansicht: SOC-Linie muss die ~309 Zeilen der letzten 7 Tage abbilden (7–100 %).
- Screenshot vergleichen mit Hetzner-Live.

## Nicht im Scope

- Retention/Ingest-Timing in der Cloud-DB (funktioniert korrekt).
- Änderungen an `storage_soc_readings`-Schema oder Ingest-Pfad.
- Hetzner-Frontend.

## Aufwand

~0,5 Personentag, isoliert in einer Datei.
