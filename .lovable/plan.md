# Live-Wert vorhanden, Graph und KPIs leer

## Was ich in der DB gefunden habe

- Sensor `76198dac-…6176` (34987a468340 Temperatur, Shelly Cloud, Integration `aaeaac5a-…`) hat in `sensor_readings_raw`, `_5min`, `_hourly` **jeweils 0 Zeilen**.
- Der Live-Wert `47,7 °C` kommt aus `gateway_sensor_snapshots.sensors` (JSONB-Array), das der `shelly-api`-Aufruf alle 30-60 s aktualisiert (letzter Fetch 22:02:05).
- Systemweit hat `sensor_readings_raw` 282 Zeilen — aber **ausschließlich** für Meter der Integration `AICONO HA Addon Test` (Inventory-Trigger `trg_gateway_inventory_sensor_history` schreibt sie). Kein einziger Shelly-Cloud-Sensor hat je einen Rohwert geschrieben, obwohl `shelly-api.writeSensorSnapshot` bei jedem Sync `persistSensorHistory(...)` aufruft und die UUIDs (`34987a468340_temp0`) korrekt zu einem Meter matchen.
- Kill-Switch `sensor_history_enabled = true`, Meter ist nicht archiviert, `sensor_uuid` und `location_integration_id` sind gesetzt — die Filter im Helper würden passen.

Daraus folgt: der `persistSensorHistory`-Insert für Shelly-Cloud schlägt still fehl oder das Meter-Lookup liefert leer. Weil der HA-Addon-Pfad (via DB-Trigger auf `gateway_device_inventory`) sauber schreibt und der Shelly-Cloud-Pfad (via Helper direkt in `sensor_readings_raw`) nicht, ist die Ursache im Helper- oder Client-Kontext von `shelly-api` zu suchen — nicht im UI. Das Detail-Dialog-Verhalten (KPIs + Momentanwert = „—") ist dann Folgefehler.

## Umsetzung

### 1. Ursache im Shelly-Cloud-Ingest verifizieren und beheben
- In `supabase/functions/shelly-api/index.ts` und `_shared/sensorHistory.ts`:
  - Ein diagnostisches `console.log` in `persistSensorHistory` schreiben (Anzahl gematchter Meter, Anzahl `rows`, Insert-Fehlermeldung ohne Delta-Guard-Skip). Das erlaubt, im nächsten Sync-Zyklus (2 Minuten) genau zu sehen, ob es am Client (RLS/Grant), an der Meter-Query oder am Insert-Payload scheitert.
  - Prüfen, mit welchem Key `shelly-api` seinen Supabase-Client baut. `sensor_readings_raw` hat RLS — wird der Client nur mit `SUPABASE_ANON_KEY` erstellt, blockt RLS den Insert. Falls das der Fall ist: Insert konsequent über `SUPABASE_SERVICE_ROLE_KEY` (analog zum Snapshot-Upsert).
- Anschließend Logs 2-3 Zyklen beobachten und ggf. den konkreten Fehler adressieren (fehlender Grant, fehlende Policy für `service_role`, oder Payload-Feld wie `sensor_uuid` NOT NULL).

### 2. UI: Momentanwert im Sensor-Detail-Dialog fällt auf Snapshot zurück
- In `EnergyFlowMonitor.tsx` (Detail-Dialog) für Sensoren:
  - Wenn `latestSensor` aus `sensor_readings_raw` fehlt, den Wert aus `gateway_sensor_snapshots.sensors` per `sensor_uuid` lesen (gleiche Quelle wie die Kachel) und im „Momentanwert"- und „Letzter Wert"-Feld anzeigen — plus dezenter Hinweis „Verlaufsaufzeichnung startet" solange keine Rohwerte existieren.
  - „Datenpunkte" bleibt bei 0, solange keine Rohzeilen da sind (korrekt).
- Damit ist die UI konsistent, auch bevor Punkt 1 greift.

### 3. Kurze Validierung
- Nach dem Fix in Punkt 1: `SELECT count(*) FROM sensor_readings_raw WHERE meter_id = '76198dac-…6176'` prüfen (erwartet: >0 innerhalb weniger Minuten). Graph im Dialog füllt sich dann automatisch, sobald die 24h-Query Rohzeilen sieht; KPIs (Ø/Max/Min) folgen mit dem nächsten 5-Min-Rollup.

## Technisches (nicht wichtig, nur Detail)

- Betroffene Dateien: `supabase/functions/shelly-api/index.ts`, `supabase/functions/_shared/sensorHistory.ts`, `src/components/dashboard/EnergyFlowMonitor.tsx`.
- Keine Migration nötig — außer sich in Punkt 1 herausstellt, dass `service_role`-Insert-Rechte oder eine Insert-Policy auf `sensor_readings_raw` fehlen. In dem Fall Grant/Policy nachziehen.
- IO-Impact: 0 zusätzliche Reads/Writes gegenüber heute — der Aufruf `persistSensorHistory` erfolgt bereits, er läuft nur ins Leere.
