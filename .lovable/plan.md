

# Fix: 30-Minuten-Peaks in Loxone-Leistungsdaten

## Ursache

Die Loxone Meter-Controls aktualisieren intern ihre Periodenzähler (Rd, Rm, Ry) exakt alle 30 Minuten (:00 und :30). Während dieser Neuberechnung kann der "Pf" (actual power) Output kurzzeitig einen falschen Wert liefern — typischerweise einen Spike, der in der Loxone-App nicht sichtbar ist, weil diese die Daten anders glättet.

Die bestehende Spike-Detection (`SPIKE_FACTOR = 3.0`) greift nicht zuverlässig, weil:
- Die Spikes je nach Zähler unter dem 3×-Schwellenwert liegen können
- Das Baseline-Minimum von 5 kW bei kleinen Zählern (z.B. Eigenverbrauch nahe 0) überhaupt nicht greift

## Lösung

**Datei:** `supabase/functions/loxone-api/index.ts`

Einen **zeitbasierten Plausibilitätsfilter** für die :00/:30-Grenzen hinzufügen:

1. **Prüfung**: Wenn der aktuelle Zeitpunkt innerhalb von ±1 Minute einer 30-Minuten-Grenze liegt (Minuten 0, 1, 29, 30, 31, 59), wird ein **verschärfter Spike-Check** angewandt
2. **Verschärfter Check**: An diesen Zeitpunkten wird `SPIKE_FACTOR` auf **1.8** reduziert (statt 3.0) und `SPIKE_BASELINE_MIN` auf **1 kW** (statt 5 kW)
3. **Fallback**: Wenn weniger als 3 historische Werte vorliegen (kein Median möglich), wird der Wert trotzdem durchgelassen — der Filter greift nur bei ausreichend Baseline-Daten

**Pseudocode:**
```typescript
const minute = now.getMinutes();
const isNearBoundary = minute <= 1 || (minute >= 29 && minute <= 31) || minute >= 59;

const effectiveSpikeFactor = isNearBoundary ? 1.8 : SPIKE_FACTOR;
const effectiveBaselineMin = isNearBoundary ? 1.0 : SPIKE_BASELINE_MIN;

const isSpike = recentVals.length >= 3 
  && median >= effectiveBaselineMin 
  && absForSpike > median * effectiveSpikeFactor;
```

## Auswirkung

- Eliminiert die 30-Minuten-Peaks ohne echte Leistungswerte zu unterdrücken
- Der verschärfte Faktor 1.8× an den Grenzen ist konservativ genug, um echte Laständerungen (z.B. Wärmepumpe schaltet ein) nicht fälschlich zu filtern
- Keine Änderung am Verhalten für Zeitpunkte abseits der 30-Minuten-Grenzen

