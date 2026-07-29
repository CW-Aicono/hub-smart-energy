## Befund aus der aktuellen Prüfung

**Das Backend ist nicht komplett offline**, aber es ist unter Last so stark blockiert, dass Datenbank-/API-Zugriffe zeitweise auslaufen.

Verifizierte Signale:

- Lovable Cloud selbst meldet den Backend-Dienst als erreichbar.
- Die DB-Metriken konnten trotzdem nicht geladen werden: Timeout beim Metrik-Endpunkt.
- PostgreSQL-Logs zeigen wiederholt `canceling statement due to statement timeout`, Verbindungsabbrüche und Cron-Startup-Timeouts.
- Edge-Function-Logs zeigen eine Welle von `ocpp-persistent-api`-Aufrufen mit **90s/150s Laufzeit** und `500/504`.
- Die langsamsten DB-Statements werden aktuell von Zeitreihen-/Historienpfaden dominiert:
  - `sensor_readings_raw` globale Zeitabfragen: 391 Aufrufe, Ø ca. 3,7s, max ca. 7,9s, total ca. 24 Minuten DB-Zeit.
  - `sensor_readings_5min` globale Zeitabfragen: Ø ca. 1,3s.
  - Sehr viele Inserts in `sensor_readings_raw`, `meter_power_readings`, `ocpp_meter_samples`, `gateway_sensor_snapshots`, `ocpp_message_log`.
- `sensor_readings_raw` hat aktuell ca. 298.000 Zeilen, `sensor_readings_5min` ca. 41.000 Zeilen. Das ist nicht riesig, aber die Kombination aus globalen Reads, häufigen Cron-/Edge-Aufrufen und synchroner Verarbeitung erzeugt offenbar täglichen Druck.

## Wahrscheinliche Hauptursache

Kein einzelner „Backend kaputt“-Fehler, sondern **Lastspitzen durch mehrere neu hinzugekommene Datenpfade**:

1. **Sensor-Historisierung** schreibt häufig Rohwerte und aggregiert regelmäßig global über `sensor_readings_raw`.
2. **Super-Admin-/Monitoring-Karten** fragen globale Historien-/Count-Daten ab, teils ohne Tenant-/Meter-Grenze.
3. **OCPP-Persistent-API** verarbeitet Meter-Samples, virtuelle Zähler, kumulative Werte und Logeinträge synchron in einem Request. Wenn DB-Zugriffe warten, stauen diese Requests bis 90–150s und blockieren weitere Kapazität.
4. **Cron-Jobs laufen parallel** zu Live-Ingest und UI-Abfragen. In den Logs ist genau dieses Muster sichtbar: Cron-Starts, Statement-Timeouts, Edge-Function-Timeouts.

Wichtig: Ich würde **nicht zuerst ein größeres Backend empfehlen**. Erst müssen wir die Lastquellen entschärfen. Wenn danach DB-Health weiterhin Speicher-/Connection-Sättigung zeigt, können wir Compute-Größe bewerten.

## Plan zur dauerhaften Stabilisierung

### 1. Sofort-Stabilisierung einbauen

- Einen klaren **Notfallmodus** für Super-Admin schaffen:
  - Sensor-Historisierung temporär deaktivieren.
  - OCPP-Message-Debug-Logging temporär reduzieren/deaktivieren.
  - Nicht-kritische Monitoring-/Metrik-Crons pausierbar machen.
- Bestehende Kill-Switches nutzen/ergänzen, aber nicht nur manuell verstecken: der Status muss sichtbar sein.
- Ziel: Bei Lastspitzen innerhalb weniger Sekunden Last wegnehmen können, ohne Backend-Neustart als tägliches Ritual.

### 2. Globale Sensor-Historienabfragen entfernen

Betroffene Muster:

- `SensorHistorySettingsCard` zählt globale Rows nach Zeitfenster.
- Zeitreihen-Komponenten dürfen nur meter-/tenant-begrenzt lesen.
- Aggregator liest alle Rohwerte der letzten 15 Minuten global.

Änderung:

- Super-Admin-Anzeigen auf **vorgehaltene Status-/Statistikwerte** umstellen statt Live-Counts auf großen Tabellen.
- Keine UI-Abfrage mehr wie „alle `sensor_readings_raw` seit X“ ohne Tenant/Meter.
- Sensor-Charts bleiben erlaubt, aber ausschließlich:
  - `.eq("tenant_id", tenant.id)` sofern Tenant-Kontext vorhanden,
  - `.eq("meter_id", meterId)` für Detailansichten,
  - harte Limits und sinnvolle Aggregationsebene.

### 3. Sensor-Aggregator umbauen

Aktuell lädt `sensor-history-aggregator` bis zu 20.000 Raw-Zeilen der letzten 15 Minuten in die Edge Function und aggregiert dort.

Umbau:

- Aggregation datenbanknah machen oder strikt in kleinen Batches:
  - nach `tenant_id`/Zeitfenster begrenzen,
  - mit Wasserzeichen/`last_processed_at` arbeiten,
  - keine globale Vollfenster-Verarbeitung bei jedem Lauf.
- 5-Minuten-Buckets inkrementell aktualisieren.
- Aggregator-Lauf darf bei Last nicht 90s+ hängen, sondern sauber abbrechen und beim nächsten Lauf fortsetzen.

### 4. OCPP-Persistent-API entkoppeln

Betroffener Hotspot: `ocpp-persistent-api`, besonders Meter-Samples und Message-Logs.

Änderung:

- Kritische OCPP-Antworten schnell halten.
- Nicht-kritische Folgearbeiten entkoppeln:
  - Message-Logs nur gebündelt oder bei Debug aktiv.
  - Virtuelle-Zähler-Spiegelung und kumulative Updates in eine schlanke DB-Funktion oder Queue-ähnlichen Batch-Pfad verschieben.
  - Harte Payload- und Laufzeitgrenzen.
- Ziel: Wallbox-/OCPP-Server bekommt nicht erst nach 90–150s eine Antwort.

### 5. Schreiblast drosseln und deduplizieren

- Sensor-Historie: Delta-Guard zusätzlich datenbankseitig absichern, nicht nur im warmen Edge-Function-Speicher.
- OCPP-/Gateway-Samples: doppelte oder zu häufige identische Werte nicht erneut schreiben.
- `ocpp_message_log` konsequent mit Retention und optionalem Debug-Level betreiben.
- Für Live-Ansichten primär Snapshot-/Latest-Tabellen nutzen, nicht Rohhistorie.

### 6. Indexe und Retention final prüfen

Bereits verifiziert:

- Es gibt Zeit-/Meter-Indexe auf `sensor_readings_raw`, `sensor_readings_5min`, `meter_power_readings`, OCPP-Tabellen.

Weitere Prüfung/Anpassung:

- EXPLAIN für die echten Top-Queries ausführen.
- Nur gezielte Indexe ergänzen, falls der Plan zeigt, dass vorhandene Indexe nicht genutzt werden.
- Rohdaten-Retention prüfen: Wenn 5-Minuten-/Stunden-/Tages-Aggregate vorhanden sind, sollten Rohwerte nur so lange bleiben, wie fachlich nötig.

### 7. Monitoring gegen Wiederholung

- Super-Admin Health-Panel erweitern um:
  - letzte Edge-Function-Timeouts,
  - langsamste DB-Query-Klassen,
  - Cron-Fehler/Startup-Timeouts,
  - Sensor-/OCPP-Schreibvolumen pro Stunde,
  - aktive Kill-Switches.
- Warnschwellen definieren:
  - OCPP-API > 5s,
  - DB-Statement-Timeouts > 0,
  - Sensor-Aggregator-Laufzeit > 20s,
  - Metrik-Endpunkt nicht erreichbar.

### 8. Verifikation nach Umsetzung

Nach der Umsetzung prüfen wir getrennt:

- Backend-Metriken laden wieder zuverlässig.
- `slow_queries` zeigt keine globalen `sensor_readings_raw`-Zeitabfragen mehr in den Top 5.
- `ocpp-persistent-api` hat keine 90s/150s Timeouts mehr.
- Login und datenintensive Seiten laden wieder.
- Sensor-/Zähler-/OCPP-Graphen funktionieren weiterhin.
- Automationen und Live-Werte bleiben erhalten.

## Umsetzungsvorschlag in Reihenfolge

1. Notfall-Kill-Switches und nicht-kritische Cron-/Logging-Last reduzieren.
2. Globale Sensor-Historien-Counts aus der UI entfernen/ersetzen.
3. Sensor-Aggregator inkrementell umbauen.
4. OCPP-Persistent-API entkoppeln und Logging drosseln.
5. EXPLAIN/Index-Runde nur für verbleibende Top-Queries.
6. Health-/Alerting-Anzeige einbauen.
7. Final verifizieren mit Logs, DB-Health und echten Seitenaufrufen.