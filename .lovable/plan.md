

# Fix: Spotpreis-Tooltip zeigt Preis doppelt an

## Problem

Am Übergangspunkt (letzter vergangener Datenpunkt) haben sowohl `pastData` als auch `futureData` einen gültigen `price`-Wert (Zeile 49 kopiert den Wert). Recharts zeigt dann beide Lines im Tooltip — einmal grau, einmal grün.

Auch bei rein vergangenen oder rein zukünftigen Datenpunkten rendern beide `<Line>`-Komponenten jeweils einen Tooltip-Eintrag (einer mit `undefined`, der andere mit dem Wert). Recharts filtert `undefined` teils nicht zuverlässig.

## Lösung

**Datei:** `src/components/dashboard/SpotPriceWidget.tsx`

Einen **custom Tooltip** (`content`-Prop) statt des Default-Formatters verwenden:

1. Neue Funktion `CustomTooltip` erstellen, die den `payload` analysiert
2. Aus den payload-Einträgen nur den **einen gültigen Wert** anzeigen (der nicht `undefined`/`null` ist)
3. Falls am Übergangspunkt beide gültig sind: nur den **zukünftigen** (grünen) Wert anzeigen
4. Die Farbe des Werts entspricht der jeweiligen Line-Farbe:
   - Vergangener Wert → `hsl(var(--muted-foreground))` (grau)
   - Zukünftiger Wert → `hsl(var(--primary))` (grün)
5. Label (Zeitstempel) wird aus `payload[0].payload.dateLabel` + `time` gebildet

**Ergebnis:** Genau ein Preis-Eintrag im Tooltip, farblich passend zur Linie.

