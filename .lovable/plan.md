## Ziel

`sensor_readings_raw` dauerhaft entlasten, damit der Backend-Notfallmodus wieder ausgeschaltet werden kann, ohne dass die tägliche Überlastung zurückkommt.

## Aktueller Stand (verifiziert)

- `sensor_readings_raw` hat ca. 300k Zeilen, Retention laut UI 7 Tage.
- Notfallmodus aktiv: `backend_emergency_mode = true`, `sensor_history_enabled = false`.
- Aggregator (`sensor-history-aggregator`) läuft datenbanknah via RPC `aggregate_sensor_readings_5min`, wird aktuell durch Notfallmodus geblockt.
- Hauptlastquellen laut `slow_queries`: globale Zeitfensterscans auf `sensor_readings_raw` und häufige Inserts.

## Maßnahmen

### 1. Schreiblast an der Quelle senken
- Delta-Guard als **DB-Trigger** auf `sensor_readings_raw`: identische Werte innerhalb X Sekunden je `meter_id` verwerfen (nicht nur im Edge-Speicher).
- Minimaler Sample-Abstand pro Sensor (z.B. 30s) serverseitig erzwingen.
- Sensor-Rohwerte werden nur noch geschrieben, wenn ein 5-Min-Bucket noch nicht „geschlossen“ ist — sonst direkt in `sensor_readings_5min`.

### 2. Retention drastisch verkürzen
- Rohdaten von 7 Tagen auf **48 Stunden** reduzieren. Alles ältere wird durch 5-Min-Buckets abgedeckt.
- `cleanup_sensor_readings_raw` stündlich statt täglich laufen lassen, in kleinen Batches (`DELETE ... LIMIT`) damit kein Long-Lock entsteht.
- Nach Bereinigung `VACUUM (ANALYZE)` einmalig, danach Autovacuum-Schwellen für die Tabelle enger stellen.

### 3. Aggregator inkrementell und selbstheilend
- Wasserzeichen `sensor_aggregator_last_run_at` in `system_settings`, Aggregator verarbeitet nur `(last_run, now())`.
- Harte Laufzeitgrenze (z.B. 15s) in der RPC — bei Überschreitung sauber abbrechen und Wasserzeichen nicht vorrücken.
- Kein globales 15-Min-Fenster mehr bei jedem Lauf.

### 4. UI-/Super-Admin-Abfragen entschärfen
- Alle verbleibenden Live-Counts auf `sensor_readings_raw` auf `pg_class.reltuples` (estimated) umstellen.
- Sensor-Charts strikt: immer `meter_id` + Zeitfenster + `LIMIT`. Keine tenant-weiten Reads mehr.
- Bei Zeiträumen > 24h automatisch auf `sensor_readings_5min` umschalten statt Rohdaten zu lesen.

### 5. Indexe gezielt prüfen (nicht blind hinzufügen)
- `EXPLAIN (ANALYZE, BUFFERS)` für die Top-3-Queries aus `slow_queries`.
- Nur wenn der Plan zeigt, dass ein Index fehlt oder nicht genutzt wird, einen ergänzen. Ziel: kein Seq Scan auf `sensor_readings_raw` mehr.

### 6. Sicherer Wiederanlauf
Reihenfolge zum Verlassen des Notfallmodus:
1. Retention verkürzen + Cleanup laufen lassen, Tabellengröße prüfen.
2. Delta-Guard-Trigger aktiv, Aggregator inkrementell.
3. `sensor_history_enabled = true` (Schreiben wieder an), Aggregator läuft, 30 Min beobachten (`db_health`, `slow_queries`, Edge-Logs).
4. Wenn stabil: `backend_emergency_mode = false`.
5. OCPP-Rohtelegramm-Logging bleibt vorerst aus, wird separat entschieden.

### 7. Frühwarnung gegen Rückfall
- Super-Admin Health-Karte ergänzen: Zeilenanzahl (estimated), Aggregator-Laufzeit, letzte Cleanup-Ausführung, aktive Kill-Switches.
- Alerts: Aggregator > 20s, DB-Statement-Timeouts > 0, Tabellengröße > Schwellwert.

## Nicht enthalten

- Compute-Upgrade — erst prüfen, nachdem obige Schritte umgesetzt und `db_health` neu gemessen wurde.
- OCPP-Persistent-Server: separat, ist bereits gehärtet (8s Timeout, Fire-and-forget).

## Hetzner-Hinweis

⚠️ **Hetzner-Supabase**: Änderungen an `cleanup_sensor_readings_raw` (pg_cron) und ggf. neue Postgres-Trigger müssen vom Hetzner-Programmierer auf der self-hosted Supabase einmalig eingespielt werden. Edge Functions (`sensor-history-aggregator`) ebenfalls redeployen.

## Verifikation nach Umsetzung

- `sensor_readings_raw` Zeilenzahl deutlich kleiner und stabil.
- `slow_queries`: keine globalen Rohdaten-Zeitscans mehr in den Top 10.
- `db_health`: keine Statement-Timeouts, Connection-Sättigung < 50 %.
- Sensor-Charts (24h, 7d, 30d) laden weiterhin korrekt.
- Notfallmodus ist aus und bleibt es über 24h.
