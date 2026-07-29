## Befund (gemessen, nicht geraten)

Backend-Infrastruktur ist gesund: Datenbank und Pooler laufen, Speicherplatte 20 %, Verbindungen 27/60, RAM 67 %, keine Neustarts. Das Problem liegt **nicht** an der Instanzgröße, sondern an einer Tabelle.

**Hauptursache — `meter_power_readings_5min`:**

- 1.878.917 Zeilen, 431 MB Daten + 187 MB Indizes, Daten **seit 16.02.2026** (keine Retention, obwohl es sich um 5-Minuten-Rohaggregate handelt; nur 9.627 Zeilen davon sind der letzte Tag)
- `autovacuum_count = 0` → die Tabelle wurde **noch nie** automatisch gevacuumt, bei 101.094 UPDATEs und 45.092 toten Zeilen
- Folge: Visibility Map ist veraltet, Index-Only-Scans fallen auf Heap-Fetches zurück. Im EXPLAIN sind für 249 gelesene Zeilen **80.099 Buffer** angefallen; ein Sortierlauf über die Tabelle brauchte 20 Sekunden.
- Genau diese Tabelle ist der zweitgrößte Read-Ausreißer: 166 Aufrufe, Mittel 492 ms, Maximum 7,48 s

**Verstärkende Faktoren:**

- Schreiblast mit Latenzspitzen: `sensor_readings_raw` (2.062 Inserts, max 4,2 s), `bridge_event_log` (1.512), `meter_power_readings` (1.479), `ocpp_meter_samples` (517), `charge_points`-Status/Pong-Updates (824 + 987, max 7,3 s)
- `meter_cumulative_readings`: 622.754 Zeilen, 219 MB Daten + 130 MB Indizes, ebenfalls nie gevacuumt
- 270.750 zurückgerollte Transaktionen gegenüber 1,29 Mio. Commits (≈ 17 %) — Ursache noch **nicht** verifiziert, muss geprüft werden

## Umsetzungsplan

**Schritt 1 — Soforthilfe: Tabelle entstauben**
`VACUUM (ANALYZE)` auf `meter_power_readings_5min` und `meter_cumulative_readings` ausführen (nicht in einer Migration, sondern als Wartungsbefehl bzw. einmaliger pg_cron-Job, da VACUUM nicht in einer Transaktion läuft). Das stellt die Visibility Map wieder her und beseitigt die Heap-Fetches sofort.

**Schritt 2 — Autovacuum pro Tabelle aggressiv einstellen**
Migration mit `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.01, autovacuum_vacuum_cost_delay = 2)` für `meter_power_readings_5min`, `meter_cumulative_readings`, `meter_power_readings`, `sensor_readings_raw`. Damit greift Autovacuum bei diesen großen Tabellen wieder regelmäßig statt praktisch nie.

**Schritt 3 — Retention für die 5-Minuten-Tabelle**
5-Minuten-Auflösung wird im UI nur für Tages-/Wochenansichten gebraucht; ältere Zeiträume kommen aus `meter_period_totals`/`meter_daily_totals_mv`. Neue Cleanup-Funktion + pg_cron-Job (stündlich), der `meter_power_readings_5min` auf **90 Tage** kürzt — in Batches, um Schreib-Spitzen zu vermeiden. Vor dem Löschen wird geprüft, dass die Tagesaggregate für die betroffenen Zeiträume vorhanden sind. Das reduziert die Tabelle grob auf die Hälfte.

**Schritt 4 — Rollback-Quelle identifizieren**
Postgres-Logs und Edge-Function-Logs gezielt nach fehlschlagenden Statements durchsuchen (Verdacht: wiederholte Insert-Konflikte oder RLS-Ablehnungen aus Worker/Ingest-Pfaden). Erst nach Verifikation wird gefixt — kein Blindfix.

**Schritt 5 — Nachmessen**
`slow_queries` und `db_health` erneut abrufen und mit den heutigen Werten vergleichen (Ziel: Mittel < 100 ms und keine Maxima über 2 s bei den Read-Queries).

## Technische Details

- Keine `CREATE INDEX CONCURRENTLY` in Migrationen; VACUUM läuft außerhalb der Migration.
- Der bestehende Unique-Index `meter_power_readings_5min_meter_bucket_res_idx` (113 MB) bleibt; nach VACUUM + Retention wird er automatisch wieder effizient. Zusätzliche Indizes sind vorerst nicht nötig — der Plan wählt bereits den richtigen Index, das Problem ist Bloat und Tabellengröße.
- Keine Frontend-Änderungen in diesem Schritt: die Analytics-Abfragen sind bereits auf Einzel-Meter-Calls umgestellt.  
  
Anmerkung zu Schritt 3: WICHTIG!  
Der Tenant muss auch alle historischen Daten (älter als 90 Tage, also seit Aufzeichnungsbeginn) als Tages- und Wochenansicht nachsehen können. Hier würde im äußersten Notfall dann eine 15-Minuten Auflösung ausreichend sein, sollte aber nach Möglichkeit vermieden werden.  
  
  
  