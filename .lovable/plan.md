## Klarstellung aufgenommen

- Sensoren liefern **Momentanwerte** (°C, %, V, bool). Keine Integration kW→kWh. Aggregate sind **Zeit-gewichtete Mittel + Min + Max + Last**, nicht Summen.
- Die im Screenshot sichtbaren Werte kommen von **Shelly Cloud** und dem **AICONO Gateway** (Push via `gateway-ingest`). Loxone-WS-Worker liefert im aktuellen Bild nichts, wird aber weiter mitgezogen, damit Loxone-Standorte gleichwertig historisiert werden.

## Verifizierter Ist-Stand

- Migration mit `sensor_readings_raw`, `sensor_readings_5min` (avg/min/max/last, `sample_count`), Retention-Cron (7 T / 400 T), Kill-Switch `sensor_history_enabled` liegt.
- `_shared/sensorHistory.ts` mit Delta-Guard-Insert wird aus `shelly-api`, `loxone-api`, `gateway-ws` aufgerufen.
- Aggregator-Edge-Function `sensor-history-aggregator` existiert (Upsert nach `meter_id, bucket`).
- Chart `SensorHistoryChart` (24 h/7 T/30 T) ist im `MeterDetailDialog` eingebunden.

## Verifizierte Lücken

1. **Kein Ingest für den Haupt-Push-Pfad des AICONO-Gateways.** `supabase/functions/gateway-ingest/index.ts` (die POST-Route, über die das AICONO-Gateway alle Snapshots liefert – u. a. die 13 Sensoren aus dem Screenshot) ruft `persistSensorHistory` nicht auf. Damit landet **nichts** in `sensor_readings_raw` für die Realschule am Buchenberg → Chart bleibt leer.
2. **Loxone-WS-Worker (`docs/loxone-ws-worker/`) schreibt ebenfalls nicht in `sensor_readings_raw`.**
3. **Kein pg_cron-Trigger für den Aggregator.** Migration schedult nur Cleanup, nicht die 5-Min-Aggregation → `sensor_readings_5min` bleibt leer, Zeiträume >24 h können nichts anzeigen.
4. **Zeitliche Aggregation passt semantisch nicht für Momentanwerte.** Der Aggregator bildet aktuell den arithmetischen Mittelwert der Rohpunkte (`sum/count`). Bei ungleichmäßigem Sample-Intervall (Delta-Guard drückt konstante Phasen weg) verzerrt das. Für Temperatur/%/V muss der Bucket-Mittelwert **zeit-gewichtet** gebildet werden (Trapezregel über `recorded_at`), damit ein 30-Min-Plateau nicht dasselbe Gewicht bekommt wie ein 10-Sek-Spike.
5. **Stunden/Tag/Monat-Rollup fehlt.** Für die geplanten 7 T-, 30 T- und (zukünftig) 12 M-Ansichten braucht es Aggregate auf **Stunde**, **Tag**, **Monat** – jeweils zeit-gewichteter Mittelwert + Min + Max + Last.
6. **Chart-Präsentation.** Titel/Achse ignorieren die Sensor-Einheit; im Dialog steht weiter „Leistungsverlauf" und die Energie/Ø-Leistungs-Kacheln, obwohl der Knoten ein Momentan-Sensor ist.
7. **Kill-Switch hat keine UI.** `sensor_history_enabled` ist nur ein Row in `system_settings`.

## Umsetzung

### 1. Migration – Rollup-Tabellen + Cron
- Neue Tabellen (RLS, GRANTs, Retention wie 5-Min):
  - `sensor_readings_hourly (tenant_id, meter_id, bucket timestamptz, value_twavg, value_min, value_max, value_last, sample_count, unit, updated_at)` – Retention 2 J.
  - `sensor_readings_daily (…, bucket date, …)` – Retention 5 J.
  - `sensor_readings_monthly (…, bucket date /* Monatserster */, …)` – unbegrenzt.
- pg_cron:
  - **5-Min-Aggregation:** ruft `sensor-history-aggregator` alle 5 Min via `net.http_post` auf (per `supabase--insert`, weil URL/anon-Key projektspezifisch).
  - **Stündlich :05:** SQL-Rollup `raw → hourly` (zeit-gewichtet, letzten 3 h idempotent per UPSERT).
  - **Täglich 00:15 Europe/Berlin:** `hourly → daily`.
  - **Monatlich am 1. um 00:45:** `daily → monthly`.

### 2. Aggregator umstellen auf zeit-gewichteten Mittelwert
- `supabase/functions/sensor-history-aggregator/index.ts` neu: pro `(meter_id, bucket)` Rohwerte nach `recorded_at` sortieren, Trapez-Integral berechnen, `value_twavg = integral / (bucketEnd - firstSampleTs)`, `value_min/max/last` mitführen. Fallback für nur einen Sample im Bucket: `value_twavg = value`.
- Backfill für die letzten 15 Min bleibt der Trigger-Rhythmus; Idempotenz bleibt über `onConflict: meter_id,bucket`.

### 3. Ingest im Haupt-Datenpfad
- `supabase/functions/gateway-ingest/index.ts`: direkt nach `gateway_sensor_snapshots.upsert` `persistSensorHistory(...)` mit dem gelieferten `sensors[]`, `tenantId`, `locationIntegrationId` aufrufen (try/catch, nicht-blockierend).
- `docs/loxone-ws-worker/index.ts`: analog. Delta-Guard identisch zum Shared-Helper (abs < 0.05 & rel < 1 % innerhalb 60 s; identische Werte innerhalb 5 min unterdrücken). Booleans/Impulse ohne Delta-Guard (jede Flanke).

### 4. Chart & Dialog
- `SensorHistoryChart`:
  - Titel dynamisch: „Verlauf · {Einheit}" (Einheit aus Prop; leere Einheit ⇒ nur „Verlauf").
  - Zeitraum-Erweiterung: **24 h / 7 T / 30 T / 12 M**.
  - Datenquelle je nach Range: 24 h → `raw`, 7 T → `sensor_readings_5min`, 30 T → `sensor_readings_hourly`, 12 M → `sensor_readings_daily`.
  - Bool/on-off (Einheit fehlt und Werte ∈ {0,1}) ⇒ Step-Chart, Y-Achse [0, 1] mit Labels „Aus/Ein".
  - Y-Achse formatiert `toLocaleString("de-DE")` mit Einheiten-Suffix.
- `src/components/dashboard/EnergyFlowMonitor.tsx` – `MeterDetailDialog`:
  - Erkennt Momentan-Sensor (kein Energie-Meter: keine kWh-Serie / `role` kein Meter).
  - Blendet die Energie-Kacheln (Ø Leistung, Max, Min, Energie) und den Titel „Leistungsverlauf" aus.
  - Zeigt stattdessen Kacheln „Aktuell / Min / Max / Ø (Zeitraum)" aus `sensor_readings_5min`/`hourly` je nach Range.
  - Reicht die Einheit aus `meters.unit` an `SensorHistoryChart` durch (nicht `meterUnitRaw`).

### 5. Super-Admin Kill-Switch
- Karte „Sensor-Historie" in `src/pages/SuperAdminSettings.tsx`:
  - Toggle für `system_settings.sensor_history_enabled`.
  - Live-Zähler: Zeilen der letzten 24 h in `sensor_readings_raw` und `sensor_readings_5min` (RPC oder direkter `count` mit `head:true`), damit der Admin sofort sieht, ob Daten fließen.
  - Hinweistext: „Rohdaten 7 T, 5-Min 400 T, Stunden 2 J, Tage 5 J, Monate unbegrenzt".

## Nicht Teil des Plans
- Keine Änderung an bestehenden Energie-Meter-Pfaden (`meter_power_readings_5min` bleibt unverändert).
- Keine Materialized Views – klassische Tabellen + pg_cron, damit die Retention einfach steuerbar bleibt.

## Reihenfolge
1. Migration: Rollup-Tabellen + pg_cron-SQL-Rollups.
2. Aggregator umstellen (zeit-gewichtet).
3. `supabase--insert`: pg_cron-Trigger für 5-Min-Aggregator (URL + anon-Key).
4. Ingest in `gateway-ingest` und `loxone-ws-worker`.
5. Chart + `MeterDetailDialog` (Einheit, Momentan-Modus, 12 M-Range).
6. Super-Admin Toggle + Live-Zähler.

Bitte bestätigen, dann arbeite ich die Punkte in dieser Reihenfolge ab.
