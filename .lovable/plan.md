
## Loxone-Sensorname in Messstellen-Dialog anzeigen

### Was wird gemacht?

1. **EditMeterDialog**: Unter dem Feld "Name *" wird in kleiner Schrift der originale Loxone-Sensorname angezeigt (z. B. "Loxone: Stromverbrauch00"), sofern der Zähler automatisch erfasst wird und ein Sensor zugeordnet ist. Der Name wird aus der geladenen Sensorliste ermittelt (via `sensor_uuid`).

2. **AddMeterDialog**: Wenn ein Sensor ausgewählt wird, wird dessen Name automatisch in das Feld "Name" übernommen (als Standardwert). Der Benutzer kann den Namen danach frei ändern.

### Technische Details

**EditMeterDialog.tsx (Zeile ~371-374)**:
- Unter dem Name-Input wird eine Zeile `<p className="text-xs text-muted-foreground">` mit dem Loxone-Sensornamen ergänzt
- Die Variable `sensorDisplayName` (Zeile 80) existiert bereits und liefert den originalen Namen
- Anzeige nur wenn `captureType === "automatic"` und `selectedSensor` vorhanden ist
- Format: `Loxone: Stromverbrauch00`

**AddMeterDialog.tsx (Zeile ~43, ~242-251)**:
- Wenn ein Sensor im Dropdown ausgewählt wird, wird `setName(sensorName)` aufgerufen, aber nur wenn das Name-Feld noch leer ist
- Unter dem Name-Input wird ebenfalls der Loxone-Sensorname in klein angezeigt, sobald ein Sensor gewählt ist
- Format: identisch zum EditMeterDialog
