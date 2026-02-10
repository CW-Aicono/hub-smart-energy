

## Gemeinsamer Hook `useLiveSensorValues`

Die duplizierte Sensor-Abruf-Logik aus `FloorPlanWidget.tsx` und `FloorPlanDashboardWidget.tsx` wird in einen einzigen Hook zusammengefasst.

### Was passiert

1. **Neuer Hook `src/hooks/useLiveSensorValues.ts`** wird erstellt:
   - Nimmt eine `floorId` entgegen
   - Nutzt intern `useFloorSensorPositions` und `useLocationIntegrations`
   - Ruft die `loxone-api` Edge Function auf und mappt die Ergebnisse
   - Auto-Refresh alle 5 Minuten
   - Gibt `sensorValues`, `loadingValues` und `refreshSensorValues` zurueck

2. **`FloorPlanDashboardWidget.tsx`** wird bereinigt:
   - Die gesamte Sensor-Fetch-Logik (ca. 60 Zeilen) wird entfernt
   - Stattdessen ein einziger Aufruf: `const { sensorValues } = useLiveSensorValues(selectedFloorId)`

3. **`FloorPlanWidget.tsx`** wird ebenfalls bereinigt:
   - Gleiche Vereinfachung – die duplizierte Logik wird durch den Hook ersetzt
   - `useFloorSensorPositions` und `useLocationIntegrations` werden nicht mehr direkt importiert

### Ergebnis

- Ein einziger Ort fuer die Sensor-Logik
- Weniger redundante API-Aufrufe
- Einfachere Wartung bei zukuenftigen Aenderungen

### Technische Details

```text
Vorher:
  FloorPlanWidget ──> useFloorSensorPositions + loxone-api fetch
  FloorPlanDashboardWidget ──> useFloorSensorPositions + loxone-api fetch

Nachher:
  FloorPlanWidget ──> useLiveSensorValues(floorId)
  FloorPlanDashboardWidget ──> useLiveSensorValues(floorId)
                                    └──> useFloorSensorPositions + loxone-api fetch (einmalig)
```

