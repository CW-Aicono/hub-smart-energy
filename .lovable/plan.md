# Sensor-Verlauf im Detail-Dialog konditional anzeigen

## Problem
Der `MeterDetailDialog` (`src/components/dashboard/EnergyFlowMonitor.tsx`) zeigt aktuell **immer** unten den Block `SensorHistoryChart` ("Sensor-Verlauf"), zusätzlich zu den beiden Zähler-Graphen "Leistungsverlauf" und "Energie pro Stunde". Bei einem Zähler wie *Ladepunkt Ost 1* ist der Sensor-Verlauf redundant und leer ("Noch keine Verlaufsdaten") — verwirrend.

## Regel
Ein Detail-Fenster soll **entweder** die zwei Zähler-Graphen (Rate + Summe über Zeit) **oder** den einen Sensor-Verlauf zeigen — nie beides.

Kriterium: Summenbildung über Zeit ergibt Sinn ⇒ Zähler-Ansicht. Reine Momentanwerte (Temperatur, Feuchte, Spannung, %, Druck, ppm, lx, Hz, …) ⇒ Sensor-Ansicht.

Die dafür nötige Klassifikation existiert bereits über den in `src/lib/meterUnits.ts` eingeführten `MeterKind`:
- `power` | `volume` | `mass` | `generic` → integrierbar (Rate × Zeit = Summe) → **Zähler-Ansicht**
- `sensor` | `boolean` → nicht integrierbar → **Sensor-Ansicht**

Das bestehende `isSensor`-Flag im Dialog liefert genau diese Unterscheidung schon (Sensoren sind gerade die Nicht-Zähler-Devices).

## Änderung
In `src/components/dashboard/EnergyFlowMonitor.tsx` im `MeterDetailDialog`:

1. **Sensor-Fall (`isSensor === true` bzw. `kind === "sensor"`/`"boolean"`):**
   - "Leistungsverlauf"-Chart ausblenden
   - "Energie pro Stunde"-Chart ausblenden
   - Nur `SensorHistoryChart` unten anzeigen (bleibt wie jetzt)
   - KPI-Kacheln zeigen weiterhin Ø / Max / Min aus den Sensor-Stats (bereits implementiert); die "Energie/Summe"-Kachel wird ausgeblendet.

2. **Zähler-Fall (alle anderen `kind`s):**
   - Beide Zähler-Graphen bleiben wie bisher
   - `SensorHistoryChart` wird **nicht** gerendert (Block bei Zeile ~2230 nur bei Sensor-Fall)

3. Der Chart-Titel des Sensor-Verlaufs bleibt "Sensor-Verlauf"; Einheit wird weiterhin über `displayUnit` gesetzt.

## Betroffene Datei
- `src/components/dashboard/EnergyFlowMonitor.tsx` — nur Rendering-Guards, keine Datenlogik-Änderung.

## Nicht Teil dieser Änderung
- Keine Änderung an `SensorHistoryChart`, `sensorUnits`, `meterUnits` oder an der Sensor-Historisierung.
- Keine Änderung an anderen Widgets/Dashboards.
