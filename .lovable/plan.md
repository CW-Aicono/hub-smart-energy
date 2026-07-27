# Fix: Shelly-Cloud Sensor-Historie schreibt nicht

## Ursache (verifiziert)

`sensor_readings_raw` (und die Rollups `_5min`, `_hourly`, `_daily`) haben **keine GRANTs** an `service_role` oder `authenticated` — nur an die interne Sandbox-Rolle. Ohne PostgreSQL-Grant kann selbst ein Service-Role-Client kein INSERT ausführen (RLS bypass ≠ Grant bypass).

Warum funktioniert HA-Addon trotzdem? Weil dort ein DB-Trigger (`trg_gateway_inventory_sensor_history`) die Zeilen schreibt — Trigger laufen als Table-Owner und umgehen Grants. Der Shelly-Cloud-Pfad geht dagegen über `shelly-api → persistSensorHistory → supabase.from("sensor_readings_raw").insert()`, und genau dieser Insert wird stumm von PostgREST/Postgres abgewiesen (die diagnostischen Logs erscheinen im Log-Stream deshalb ohne Fehlermeldung, weil PostgREST bei fehlendem Grant je nach Pfad still 0 rows zurückgibt bzw. der Fehler nicht bis in den warn-Pfad reicht).

## Umsetzung

### 1. Migration: Grants nachziehen

Für alle vier Sensor-Historien-Tabellen (`sensor_readings_raw`, `sensor_readings_5min`, `sensor_readings_hourly`, `sensor_readings_daily`):

- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` (RLS-Policy scoped bereits per Tenant → sicher)
- `GRANT ALL ... TO service_role` (nötig für `shelly-api`, `loxone-api`, Rollup-Cron)

`anon` bleibt außen vor — die Tabellen sind auth-only.

### 2. Diagnostische Logs zurückbauen

Die in `_shared/sensorHistory.ts` eingebauten `console.log`-Zeilen (Meter-Count, Insert-Ergebnis) bleiben — sie sind wertvoll und billig. Kein Rollback.

### 3. Validierung

- Nach Approval + Deploy: 2-3 Sync-Zyklen (~5 min) abwarten
- `SELECT count(*), max(recorded_at) FROM sensor_readings_raw WHERE meter_id = '76198dac-…6176'` → erwartet >0
- Detail-Dialog des Shelly-Temperatursensors: Graph füllt sich, KPIs (Ø/Max/Min) folgen mit dem nächsten 5-Min-Rollup
- Snapshot-Fallback in `EnergyFlowMonitor.tsx` bleibt als Sicherheitsnetz drin

## Technisches (Detail)

- Datei: eine Migration mit vier GRANT-Blöcken
- Kein Codeänderung an Edge Functions nötig — der Insert-Aufruf ist bereits korrekt
- Kein IO-Overhead: es wird nur der bereits laufende, aber blockierte Insert freigeschaltet
