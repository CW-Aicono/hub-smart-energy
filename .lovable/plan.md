

# Manuelle Zaehler: Durchschnittsverbrauch statt Tagesanzeige

## Problem

Manuell abgelesene Zaehler liefern Ablesungen in unregelmaessigen Abstaenden (z.B. alle 4 Wochen). Die Delta-Werte werden aktuell dem exakten Ablesedatum zugeordnet, was in der Tagesansicht einen einzelnen hohen Ausschlag erzeugt -- das ist nicht sinnvoll. Fuer die Tagesansicht fehlen echte Tagesdaten gaenzlich.

## Loesung

1. **Tagesansicht**: Manuelle Zaehler werden komplett ausgeblendet -- es gibt keine aussagekraeftigen Tagesdaten.
2. **Wochen-/Monats-/Quartals-/Jahresansicht**: Der Verbrauch zwischen zwei Ablesungen wird gleichmaessig auf die dazwischenliegenden Tage verteilt (Durchschnitt). Dadurch entsteht eine realistische Darstellung statt eines einzelnen Spikes am Ablesedatum.

```text
Beispiel:
  Ablesung A: 01.01.2026 = 65.000 kWh
  Ablesung B: 01.02.2026 = 65.310 kWh
  Delta: 310 kWh ueber 31 Tage = 10 kWh/Tag Durchschnitt
  --> In der Wochenansicht: 70 kWh pro Woche (gleichmaessig verteilt)
```

## Betroffene Dateien und Aenderungen

### 1. `src/hooks/useEnergyData.tsx`

**Aenderung an `computeConsumptionDeltas`**: Optional um ein Feld `days` (Anzahl Tage zwischen den Ablesungen) erweitern, damit die Verteilung spaeter moeglich ist. Alternativ eine neue Funktion `distributeManualDeltas` erstellen:

- Nimmt die bereits berechneten Deltas (Ergebnis von `computeConsumptionDeltas`)
- Berechnet fuer jedes Delta: `dailyAvg = delta.value / daysBetweenReadings`
- Erzeugt fuer jeden Tag im Zeitraum ein synthetisches Reading mit dem Durchschnittswert
- Erste Ablesung (Baseline) generiert keine verteilten Werte

Die `allReadings`-Berechnung nutzt dann `distributeManualDeltas(computeConsumptionDeltas(manualOnly))`.

### 2. `src/components/dashboard/EnergyChart.tsx`

**Tagesansicht (Zeile 441-450)**: Block entfernen, der manuelle Readings in die 5-Minuten-Buckets einfuegt. Manuelle Zaehler werden in der Tagesansicht nicht mehr dargestellt.

**Wochen-/Monats-/Quartals-/Jahresansicht**: Keine Aenderung noetig -- die verteilten Tages-Readings aus `useEnergyData` werden automatisch korrekt in die Tages-/Wochen-Buckets einsortiert.

### 3. `src/components/dashboard/CostOverview.tsx`

Keine Aenderung noetig, da `CostOverview` bereits die `readings` aus `useEnergyData` nutzt. Die verteilten Durchschnittswerte werden automatisch korrekt summiert. Fuer die Tagesansicht: Manuelle Zaehler haben keinen Tages-Datenpunkt mehr, werden also nicht mitgezaehlt.

### 4. `src/hooks/__tests__/useEnergyData.test.tsx`

Test-Erweiterungen:
- Test fuer gleichmaessige Verteilung ueber Tage
- Test dass Tagesfilter keine manuellen Readings enthaelt

## Technische Details

### Neue Funktion `distributeManualDeltas`

```typescript
function distributeManualDeltas(
  deltas: ReadingRow[],
  originalReadings: ReadingRow[]
): ReadingRow[] {
  // Fuer jedes Delta: finde die vorherige Ablesung desselben Zaehlers
  // Berechne daysBetween = Differenz in Tagen
  // Erzeuge fuer jeden Tag im Zeitraum ein Reading mit value = delta / daysBetween
  const result: ReadingRow[] = [];
  const byMeter = new Map<string, ReadingRow[]>();
  originalReadings.forEach(r => {
    const arr = byMeter.get(r.meter_id) || [];
    arr.push(r);
    byMeter.set(r.meter_id, arr);
  });

  for (const delta of deltas) {
    const meterReadings = byMeter.get(delta.meter_id);
    if (!meterReadings) continue;
    // Finde vorherige Ablesung
    const sorted = [...meterReadings].sort((a, b) =>
      a.reading_date.localeCompare(b.reading_date)
    );
    const idx = sorted.findIndex(r =>
      r.reading_date === delta.reading_date
    );
    if (idx <= 0) continue;
    const prevDate = new Date(sorted[idx - 1].reading_date);
    const currDate = new Date(delta.reading_date);
    const daysBetween = Math.max(1,
      Math.round((currDate.getTime() - prevDate.getTime()) / 86400000)
    );
    const dailyValue = delta.value / daysBetween;
    // Erzeuge ein Reading pro Tag (ab Tag nach prevDate bis currDate)
    for (let d = 1; d <= daysBetween; d++) {
      const date = new Date(prevDate);
      date.setDate(date.getDate() + d);
      result.push({
        meter_id: delta.meter_id,
        value: dailyValue,
        reading_date: date.toISOString(),
      });
    }
  }
  return result;
}
```

### Auswirkungen

- Tagesansicht: Manuelle Zaehler verschwinden (korrekt, da keine Tagesdaten vorhanden)
- Wochenansicht: Gleichmaessige Verteilung des Verbrauchs ueber alle Tage
- Kosten: Korrekte anteilige Berechnung statt Gesamt-Delta an einem Tag
- Sankey/Pie: Korrekte Gesamtsummen (Summe der Durchschnitte = urspruengliches Delta)
