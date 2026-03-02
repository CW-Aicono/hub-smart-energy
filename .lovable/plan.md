

# Verbrauchsberechnung aus Zaehlerstaenden (Delta-Logik)

## Problem

Aktuell wird der absolute Zaehlerstand (z.B. 65.487 kWh) direkt als Verbrauch in die Dashboard-Widgets uebernommen. Bei der ersten Ablesung wird somit der komplette historische Zaehlerstand als Tagesverbrauch gewertet, was voellig falsch ist.

## Loesung

Die Verarbeitung der manuellen Ablesungen wird auf eine Delta-Berechnung umgestellt:

- **1. Ablesung** = Offset/Baseline, ergibt **Verbrauch = 0**
- **2. Ablesung** = Differenz zum vorherigen Stand, ergibt den Verbrauch im Zeitraum zwischen den beiden Ablesungen
- Jede weitere Ablesung: Verbrauch = aktueller Stand minus vorheriger Stand

Der berechnete Verbrauch wird dem Datum der **neueren** Ablesung zugeordnet (fuer die monatliche Zuordnung in Charts und Uebersichten).

## Betroffene Dateien

### 1. `src/hooks/useEnergyData.tsx` -- Hauptaenderung

Im Query werden die Rohdaten bereits chronologisch sortiert geladen (`order: ascending`). Die Transformation passiert in der `allReadings`-Berechnung:

**Neue Hilfsfunktion `computeConsumptionDeltas`:**
- Gruppiert alle manuellen Readings nach `meter_id`
- Sortiert innerhalb jeder Gruppe nach `reading_date` aufsteigend
- Erste Ablesung je Zaehler: Verbrauch = 0 (wird uebersprungen)
- Jede folgende Ablesung: `value = current.value - previous.value`
- Negative Deltas (z.B. Zaehlertausch) werden auf 0 gesetzt oder als absoluter Wert genommen
- Das Datum der neueren Ablesung wird beibehalten

```text
Beispiel:
  Ablesung 1: 15.01.2026 = 65.000 kWh  -->  Verbrauch: 0 (Baseline)
  Ablesung 2: 15.02.2026 = 65.500 kWh  -->  Verbrauch: 500 kWh (am 15.02.)
  Ablesung 3: 15.03.2026 = 66.200 kWh  -->  Verbrauch: 700 kWh (am 15.03.)
```

Die restliche Logik (monatliche Zuordnung, Energieverteilung, Sankey, Kosten) bleibt unveraendert, da sie bereits auf den `value`-Feldern der Readings arbeitet -- nur die Werte aendern sich von absoluten Zaehlerstaenden zu Verbrauchsdeltas.

### 2. `src/pages/TenantEnergyApp.tsx` -- Gleiche Delta-Logik

Auch die Mieter-Energieansicht laedt `meter_readings` und muss die gleiche Delta-Berechnung anwenden, damit dort ebenfalls korrekte Verbrauchswerte erscheinen.

## Technische Details

### Neue Funktion in `useEnergyData.tsx`

```typescript
function computeConsumptionDeltas(readings: ReadingRow[]): ReadingRow[] {
  // Gruppiere nach meter_id
  const byMeter = new Map<string, ReadingRow[]>();
  readings.forEach((r) => {
    const arr = byMeter.get(r.meter_id) || [];
    arr.push(r);
    byMeter.set(r.meter_id, arr);
  });

  const result: ReadingRow[] = [];
  for (const [, meterReadings] of byMeter) {
    // Sortiere chronologisch
    meterReadings.sort((a, b) =>
      a.reading_date.localeCompare(b.reading_date)
    );
    // Erste Ablesung = Baseline, uebersprungen
    for (let i = 1; i < meterReadings.length; i++) {
      const delta = meterReadings[i].value - meterReadings[i - 1].value;
      result.push({
        meter_id: meterReadings[i].meter_id,
        value: Math.max(0, delta),
        reading_date: meterReadings[i].reading_date,
      });
    }
  }
  return result;
}
```

### Integration

In der `allReadings`-Berechnung wird `manualOnly` durch `computeConsumptionDeltas(manualOnly)` ersetzt, bevor es mit `liveReadings` kombiniert wird. Automatische Zaehler und virtuelle Zaehler bleiben davon unberuehrt, da diese bereits korrekte Verbrauchswerte liefern.

### Auswirkungen

- Dashboard-Widgets (Sankey, Pie, Kosten, Monatsbalken) zeigen korrekte Verbrauchswerte
- Erste Ablesung erzeugt keinen kuenstlichen Verbrauchssprung mehr
- Zaehlertausch (niedrigerer Wert) wird als 0 behandelt statt als negativer Verbrauch

