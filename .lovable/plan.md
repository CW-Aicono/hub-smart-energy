## Ausgangslage (verifiziert)

- `gateway_sensor_snapshots` PK = `location_integration_id` → pro Integration genau **eine** Zeile, wird bei jedem Poll überschrieben (aktuell 12 Zeilen gesamt in DB, ältester Eintrag ist der letzte Snapshot der jeweiligen Integration).
- Energie-Sensoren (kW/kWh) fließen teilweise in `meter_power_readings` bzw. `meter_power_readings_5min` — dort gibt es aber nur `power_avg`/`power_max` und keine Wertspalte für Nicht-Energie-Größen.
- Sensoren wie Temperatur (°C), Batterie (%), Feuchte, Impulse, bool, SOC etc. werden **nirgendwo historisiert** → Verläufe/Graphen aktuell nicht möglich.

## Ziel

Alle Sensor-Rohwerte so persistieren, dass:
1. Live-Anzeige weiterhin schnell bleibt (kein Regression auf `/live-values`),
2. historische Verläufe (Stunden / Tage / Wochen / Monate) darstellbar sind,
3. IO-Budget durch Delta-Guard + 5-Min-Aggregation geschont wird,
4. Retention automatisch aufräumt.

## Umsetzung

### 1. Neue Tabellen (Migration)

**`sensor_readings_raw`** – Rohwerte (kurze Retention):
- `meter_id uuid`, `tenant_id uuid`, `sensor_uuid text`, `value numeric`, `unit text`, `recorded_at timestamptz`
- Index `(meter_id, recorded_at desc)`, Partition-fähig oder BRIN auf `recorded_at`.
- Retention: **7 Tage** (pg_cron Delete-Job).
- GRANTs + RLS über `tenant_id`.

**`sensor_readings_5min`** – Aggregat (lange Retention):
- `meter_id, tenant_id, bucket timestamptz (5-Min), value_avg, value_min, value_max, value_last, sample_count`
- Unique `(meter_id, bucket)`.
- Retention: **13 Monate** (rollierend).

### 2. Ingest-Erweiterung

- `gateway-ingest` und `loxone-ws-worker`: für jedes Sensor-Event zusätzlich in `sensor_readings_raw` schreiben — mit **Delta-Guard** (nur, wenn Wert sich um mehr als konfigurierbaren Schwellwert oder länger als N Sekunden nicht geändert hat), analog zur bestehenden Bridge-Logik.
- Für Booleans/Impulse: jede Flanke schreiben, kein Delta-Guard.

### 3. Aggregation (Cron)

- Neue Edge Function `sensor-readings-aggregate` (alle 5 Min): baut aus `sensor_readings_raw` die `sensor_readings_5min`-Buckets, idempotent per Upsert.
- Optional zusätzlich stündliche/tägliche Aggregate über Materialized View oder Folgejob.

### 4. UI – Verläufe

- Neuer Reiter/Bereich **„Verlauf"** im Sensor-Detail (bereits geöffnet über die Live-Values-Kachel → `MeterDetailDialog`) mit Zeitraumumschalter (24 h / 7 T / 30 T / 12 M).
- Chart: Recharts Line/Area, Einheit dynamisch aus `source_unit_power`/`unit`, Farbe passend zur Sensorkategorie (Temperatur, %, bool → Step-Chart).
- Query: <24 h aus `sensor_readings_raw`, >24 h aus `sensor_readings_5min`.
- Loading-States und leere Zustände.

### 5. Retention & Housekeeping

- pg_cron: `sensor_readings_raw` > 7 Tage löschen (nachts).
- pg_cron: `sensor_readings_5min` > 400 Tage löschen (wöchentlich).
- Optional Kill-Switch in `system_settings` (`sensor_history_enabled`) für Notfall-Deaktivierung bei IO-Druck.

## Auswirkung / Risiken

- **Schreiblast**: mit Delta-Guard vergleichbar mit heutigen `meter_power_readings` (nur relevante Änderungen). Aggregat bündelt Lesezugriffe.
- **Speicher**: ~ (Sensoranzahl × Änderungsrate × 7 Tage) für Raw + ~ (Sensoranzahl × 288 × 400) für 5-Min → im MB-Bereich, unkritisch.
- **Backwards-kompatibel**: `gateway_sensor_snapshots` bleibt für Live-Anzeige unverändert.

## Reihenfolge der Umsetzung

1. Migration: Tabellen + GRANTs + RLS + Indizes + pg_cron-Cleanup.
2. Ingest-Pfad in `gateway-ingest` erweitern (schreibt Raw).
3. Aggregations-Edge-Function + pg_cron-Trigger (alle 5 Min).
4. UI-Verlaufs-Tab im `MeterDetailDialog` mit Zeitraumumschalter.
5. Kill-Switch in `system_settings` + Super-Admin-Toggle.

Bitte bestätigen, dann setze ich das in dieser Reihenfolge um.