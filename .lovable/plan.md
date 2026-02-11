

# Wasserdaten im Sankey und anderen Grafiken anzeigen

## Ursache

Der Wasserzähler ("Wasserzähler Hausanschluss") ist ein **automatischer Zähler** -- es gibt keine manuellen Einträge in der Datenbank. Die Live-Werte werden zwar von der Loxone-API abgerufen, aber im zentralen Daten-Hook `useEnergyData` mit `parseFloat(sensor.value)` verarbeitet. Da Loxone den Wert als deutschen String liefert (z.B. `"12,34"`), gibt `parseFloat` entweder `NaN` oder einen abgeschnittenen Wert zuruck -- und bei `NaN` wird der Eintrag komplett verworfen.

Das gleiche Problem wurde bereits auf der LiveValues-Seite behoben (dort wird jetzt `sensor.rawValue` genutzt), aber der zentrale `useEnergyData`-Hook wurde noch nicht aktualisiert.

## Loesung

### Datei: `src/hooks/useEnergyData.tsx`

**Aenderung 1 -- rawValue statt value verwenden (Zeilen 92-103):**

Die Sensor-Wert-Auslese im `fetchLiveValues`-Callback muss das neue `rawValue`-Feld nutzen (das bereits in der Edge Function bereitgestellt wird), mit Fallback auf Komma-zu-Punkt-Konvertierung:

```text
for (const meter of intMeters) {
  const sensor = data.sensors?.find((s: any) => s.id === meter.sensor_uuid);
  if (sensor) {
    // Prefer rawValue (numeric), fall back to parsing value string
    let numVal: number;
    if (typeof sensor.rawValue === "number") {
      numVal = sensor.rawValue;
    } else if (typeof sensor.rawValue === "string") {
      numVal = parseFloat(sensor.rawValue.replace(",", "."));
    } else if (typeof sensor.value === "string") {
      numVal = parseFloat(sensor.value.replace(",", "."));
    } else {
      numVal = typeof sensor.value === "number" ? sensor.value : NaN;
    }

    if (!isNaN(numVal)) {
      newLiveReadings.push({
        meter_id: meter.id,
        value: numVal,
        reading_date: now,
      });
    }
  }
}
```

Das ist die einzige notwendige Aenderung. Sobald der Wert korrekt als Zahl geparst wird, fliesst er automatisch in alle abhaengigen Berechnungen ein (Sankey, Pie-Chart, Energiechart, Kostenubersicht).

### Zusammenfassung

| Datei | Aenderung |
|---|---|
| `src/hooks/useEnergyData.tsx` | `rawValue` statt `value` beim Parsen der Live-Sensorwerte verwenden; Komma-Fallback fuer robustes Parsen |

Keine weiteren Dateien betroffen -- der Fix im zentralen Hook wirkt sich automatisch auf alle Widgets aus (Sankey, Pie-Chart, Energiechart, Kostenubersicht).
