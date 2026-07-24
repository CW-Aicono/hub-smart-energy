## Ziel
Die obere Tabelle in `MeterManagement.tsx` (manuelle & virtuelle Zähler) erhält dasselbe visuelle Format wie die untere „Vom Gateway gelieferte Zähler-Geräte"-Tabelle (`DeviceTable`) — inkl. Typ-Icon, sortierbaren Spalten, Wert-Spalte und farbigen Status-Badges.

## Neues Spalten-Layout (obere Tabelle)

```text
[☐] [Typ-Icon] [Name ↕] [Raum ↕] [Energieart ↕] [Erfassung ↕] [Wert ↕] [Aktionen]
```

Änderungen ggü. jetzt:
- **Neu**: führende Typ-Icon-Spalte (grauer Badge mit Icon aus `getDeviceIconForMeter` je nach `energy_type` / `device_type`) — identisch zur Gateway-Tabelle.
- **Neu**: Spalte „Raum" (aus `roomNameById[m.room_id]`, „–" wenn leer) — passt zu „Zugeordneter Raum" in der unteren Tabelle.
- **Entfernt**: Spalte „Zählernummer".
- **Ersetzt**: Spalte „Einheit" → Spalte „Wert" (rechtsbündig, `font-mono`, Format `123,45 kWh` / `0,03 m³/h` etc. via `energyUnitForMeter` aus `src/lib/meterUnits.ts`).
- **Umgezogen**: Spalte „Erfassung" nutzt jetzt das Status-Badge-Styling der Gateway-Tabelle (gleiche Badge-Varianten wie bisher: `default` = automatic, `outline` = virtual, `secondary` = manual — bleibt inhaltlich gleich, nur Position analog „Status").
- Sortierbare Header via `SortableHeadUI` (wie in `DeviceTable`) für Name, Raum, Energieart, Erfassung, Wert.
- Aktions-Spalte (Bearbeiten/Archivieren/Löschen) und Bulk-Auswahl-Checkbox bleiben unverändert.

## Datenherkunft „Wert"

Pro Zeile wird der letzte Zählerstand + konfigurierte Einheit angezeigt:

- **Manuelle Zähler** (`capture_type = "manual"`): letzter Eintrag aus `meter_readings` (bereits im Projekt via ähnlicher Logik in `LiveValues.tsx` genutzt) — ein einmaliger Fetch nach `meter_id` in der aktuellen Location, gruppiert per `Map<meterId, {value, date}>`.
- **Virtuelle Zähler** (`capture_type = "virtual"`): letzter Wert aus `meter_cumulative_readings` (dieselbe Quelle, die auch das Dashboard-Widget nutzt), pro `meter_id` neuester Eintrag.
- Einheit: `energyUnitForMeter(meter)` (respektiert `unit`, fällt auf `m³` bei Wasser/Gas zurück).
- Anzeige: `"—"` wenn kein Wert vorhanden; sonst `value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " " + unit`.

Fetch als kleiner neuer Hook `useLatestMeterValues(locationId, meters)` in `src/hooks/` (lokal für diese Komponente), invalidiert bei Meter-Änderungen. Kein Realtime nötig — refetch beim Fokus reicht (analog anderen Tabellen).

## Betroffene Dateien
- `src/components/locations/MeterManagement.tsx` — Tabellen-Rewrite (Zeilen ~757–843) inkl. neuer Sort-States (analog `DeviceTable`) und Icon-Renderer. CSV-Export-Header (Zeile 716) auf neue Spalten anpassen (`Name;Raum;Energieart;Erfassung;Wert;Einheit`).
- `src/hooks/useLatestMeterValues.ts` — **neu**, kleiner Query-Hook für die zwei Quellen oben.

## Nicht im Scope
- Keine Änderungen an der unteren Gateway-Tabelle.
- Keine Änderungen an den Sensor-/Aktor-Tabs (nur der Zähler-Tab-Bereich für manuell/virtuell).
- Keine Backend-/Migrations-Änderungen.
