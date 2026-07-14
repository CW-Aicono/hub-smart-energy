## Ziel
Klick auf eine Messstellen-Karte in `/live-values` öffnet denselben Detail-Dialog wie im Energieflussmonitor (Screenshot 2: Zeitraum-Tabs 1h/24h/7d/30d, Ø/Max/Min/Energie-Kacheln, „Leistungsverlauf", „Energie pro Stunde").

## Vorgehen

1. **`MeterDetailDialog` extrahieren** aus `src/components/dashboard/EnergyFlowMonitor.tsx` (Zeilen ~1307–1860) in eine neue Datei `src/components/dashboard/MeterDetailDialog.tsx` und als named export bereitstellen. Alle mitverwendeten Konstanten (`RANGE_LABEL`, `RANGE_MS`, `ROLE_ICON`, `ROLE_LABEL`, `fmtDeNum` etc.) und Hilfsfunktionen mitnehmen bzw. importierbar machen. `EnergyFlowMonitor.tsx` importiert das Dialog anschließend aus der neuen Datei — keine Verhaltens­änderung im Energieflussmonitor.

2. **Optionale Props für Nicht-Flow-Kontext**: `allNodes` und `metersById` werden nur für die Haus-Autarkie-Berechnung genutzt. In der neuen Datei werden sie zu `allNodes?: EnergyFlowNode[]` (default `[]`) und `metersById?: Record<string, any>` (default `{}`) — dann funktioniert das Dialog auch ohne Flow-Kontext (Autarkie-Block wird nur bei `role === "house"` und vorhandenen Daten gezeigt, ist damit still).

3. **In `src/pages/LiveValues.tsx` einbinden**:
   - State `detailMeter: Meter | null` + `MeterDetailDialog` am Ende der Seite.
   - Meter-`<Card>` wird klickbar (`role="button"`, `cursor-pointer`, `hover:shadow`, `onClick` setzt `detailMeter`, Keyboard-Handler für Enter/Space).
   - Beim Öffnen wird der Meter in eine minimale `EnergyFlowNode`-Form gemappt: `{ id: meter.id, meter_id: meter.id, label: meter.name, role: <abgeleitet>, color: "", x: 0, y: 0 }`.
   - Role-Ableitung: `battery` wenn `socByMeterId.get(meter.id)` gesetzt, sonst nach `meter.energy_type` / vorhandener Klassifikation (fallback `consumer`). SOC-Prozent (`socPct`) wird aus der bestehenden `socByMeterId`-Map übergeben.
   - Manuelle/virtuelle Zähler ohne `meter_power_readings` zeigen die Zeitreihe leer — das ist okay, die Kacheln bleiben mit „–".

4. **Kein Umbau der Daten-Queries**: `MeterDetailDialog` liest weiter aus `meter_power_readings` und `energy_storages`. Keine RLS-/Migrations­änderung nötig.

## Technische Details
- Dialog-Datei: `src/components/dashboard/MeterDetailDialog.tsx` (exportiert `MeterDetailDialog` + Types `DetailRange`).
- `EnergyFlowMonitor.tsx`: ersetzt die interne Definition durch `import { MeterDetailDialog } from "./MeterDetailDialog";`. Alle bisherigen Aufrufparameter bleiben.
- `LiveValues.tsx`: Card erhält `onClick`/`onKeyDown`, kein Layout­wechsel; interne Buttons (falls später ergänzt) müssen `e.stopPropagation()` bekommen — aktuell keine vorhanden.
- Keine Übersetzungs­änderung (Dialog-Texte bleiben wie im bestehenden Dialog, deutsch).

## Nicht im Scope
- Keine Änderung an Filtern, Sortierung, Cards-Inhalten oder API/Backend.
- Kein Redesign des Dialogs.