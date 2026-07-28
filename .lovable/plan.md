## Ziel
Das Backend soll nicht nur kurzfristig wieder erreichbar sein, sondern die wiederkehrende Ursache für Timeouts/„Backend down“-Eindrücke gezielt entschärfen.

## Bestätigter aktueller Befund
- Lovable Cloud selbst meldet den Backend-Dienst aktuell als erreichbar.
- Die Health-Metriken sind trotzdem nicht abrufbar, weil die Metrik-Anfrage in einen Timeout läuft.
- In den letzten 2 Stunden sind in den Backend/Auth/Function-Logs keine neuen Fehlerzeilen zurückgekommen.
- Die langsamsten Datenbankabfragen kommen klar aus der Sensor-Historie:
  - `sensor_readings_raw` ohne `meter_id`-Filter, nur nach `recorded_at >= ...` sortiert/limitiert: bis ca. 7,9 s, im Mittel ca. 3,7 s, sehr hoher Gesamteinfluss.
  - `sensor_readings_5min` analog nach `bucket >= ...`: bis ca. 3,4 s.
- Die konkrete Quelle im Code ist sichtbar: `SensorHistorySettingsCard` fragt alle 30 Sekunden globale Sensor-Zählwerte ab und lädt dafür bis zu 1.000 IDs je Zeitraum mit Sortierung. Diese Abfragen passen exakt zu den Slow-Query-Signaturen.
- Die Tabellen haben zwar Indexe für `(meter_id, Zeit)`, aber die problematischen globalen Abfragen nutzen keinen `meter_id`-Filter. Dadurch greifen die vorhandenen Indexe nur unzureichend.

## Umsetzungsplan

### 1. Sofortige Lastquelle in der UI entschärfen
- `SensorHistorySettingsCard` so umbauen, dass sie keine großen ID-Listen mehr alle 30 Sekunden lädt.
- Stattdessen:
  - entweder echte Counts mit `head: true, count: "estimated"` verwenden,
  - oder für die Super-Admin-Karte bewusst nur kompakte Statuswerte anzeigen.
- Refetch-Intervall auf mindestens 2–5 Minuten erhöhen oder nur bei sichtbarer Karte aktivieren.

### 2. Passende Datenbankindexe für globale Zeitfenster ergänzen
- Index für `sensor_readings_raw(recorded_at desc)` ergänzen.
- Index für `sensor_readings_5min(bucket desc)` ergänzen.
- Optional zusätzlich Tenant/Zeit-Indexe, falls tenantweite Auswertungen ohne `meter_id` vorkommen:
  - `sensor_readings_raw(tenant_id, recorded_at desc)`
  - `sensor_readings_5min(tenant_id, bucket desc)`
- Danach die Slow-Query-Liste erneut prüfen.

### 3. Sensor-Aggregator härten
- `sensor-history-aggregator` liest aktuell alle Rohwerte der letzten 15 Minuten global und sortiert sie. Das ist bei vielen Sensoren wachsend teuer.
- Plan:
  - Abfrage durch neuen Zeitindex absichern.
  - Limit/Window so behalten, aber Ergebnisgröße protokollieren.
  - Falls weiter hoch: Aggregation künftig tenantweise oder inkrementell über `last_processed_at` fahren.

### 4. Notfall-/Betriebsmodus sauber machen
- Den vorhandenen Kill-Switch `sensor_history_enabled` beibehalten, aber in der Super-Admin-UI klar als Lastschutz nutzen.
- Wenn erneut Timeouts auftreten, kann Sensor-Historisierung temporär deaktiviert werden, ohne Login/Auth oder Kern-Dashboard zu blockieren.

### 5. Validierung nach Umsetzung
- Slow Queries erneut abrufen und prüfen, ob die Sensor-Abfragen deutlich sinken.
- Health-Check erneut ausführen.
- Auth-/Backend-Logs auf erneute 500/504 prüfen.
- Falls danach noch Metrik-Timeouts oder hohe Connection/Memory-Werte sichtbar sind, erst dann Lovable-Cloud-Compute-Resize prüfen; aktuell ist die belastbare erste Ursache aber die Sensor-Historie/Indexierung, nicht pauschal die Instanzgröße.

## Erwartetes Ergebnis
- Weniger langlaufende globale Sensor-Abfragen.
- Weniger Risiko, dass Auth/API-Anfragen durch Datenbanklast in Timeouts laufen.
- Wiederholbare Diagnosekette: Sensor-Last sichtbar, abschaltbar und gezielt indexiert statt jedes Mal Backend-Neustart.