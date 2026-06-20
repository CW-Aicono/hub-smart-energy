
# Ursache "100% Disk IO" — vollständige Analyse

## Wichtig vorab: zwei verschiedene "Disk"-Begriffe
- **Disk-Speicher (Platz)**: aktuell **19 % belegt** (1,2 GB von Plan-Kontingent). Kein Problem.
- **Disk-IO-Budget (Schreib-/Lese-Operationen pro Sekunde)**: aktuell **100 %**. Das ist die Auslastung der Festplatte durch ständiges Schreiben/Lesen — und genau das ist das Problem.

Eine Vergrößerung der Cloud-Instanz behebt das **nur, wenn die größere Instanz mehr IOPS bekommt**. Sinnvoller ist, die **Ursache** zu reduzieren.

## Der Loxone-Worker ist NICHT die Hauptursache
Der Worker schreibt nur in `bridge_raw_samples`, `bridge_event_log`, `meter_power_readings_5min_bridge` und `loxone_ws_session_log`. Aktuelle Werte (1 h):
- `meter_power_readings` Insert-Rate: nur **~420 Zeilen/Stunde** → unkritisch.
- Die im Slow-Query-Report sichtbaren **5,1 Mio Inserts** sind **kumuliert seit DB-Start** (nicht aktuell).

## Tatsächliche IO-Treiber (jetzt aktiv)

**1. Cron-Job-Sturm (Hauptursache, ~394 Läufe/Stunde)**
```
ems-automation-scheduler         jede Minute   →  Edge Function
peak-shaving-scheduler           jede Minute   →  Edge Function
ems-power-limit-scheduler        jede Minute   →  Edge Function
ems-dlm-scheduler                jede Minute   →  Edge Function
ems-cheap-charging-scheduler     alle 2 min    →  Edge Function
ems-gateway-periodic-sync        alle 2 min    →  Edge Function
ems-solar-charging-scheduler     alle 2 min    →  Edge Function
refresh-meter-period-totals-5min alle 5 min    →  UPDATE meter_period_totals
bridge-aggregator-every-5min     alle 5 min    →  liest bridge_raw_samples
ems-brighthub-periodic-sync      alle 5 min    →  Edge Function
snapshot-charge-point-uptime     alle 5 min    →  INSERT
```
Jeder Lauf führt zu Reads + Writes in `job_run_details`, `_http_response`, `http_request_queue` (deren Churn auch im pg_stat_user_tables sichtbar ist), plus die Function selbst schreibt in App-Tabellen.

**2. Bridge-Tabellen-Churn (Loxone WS Worker)**
- `bridge_raw_samples`: 17.868 INSERTS + 17.868 UPDATES in wenigen Stunden (Worker schreibt JEDEN Wert).
- `bridge_event_log`: 31.989 Inserts.
- `loxone_ws_session_log`: 16.416 UPDATES (Heartbeat).
- `meter_power_readings_5min`: 16.978 Inserts + Updates durch Aggregator.

**3. OCPP-Log-Churn**
- `ocpp_message_log`: 121.299 Deletes + 1.551 Inserts.

**4. Realtime-Subscription-Churn**
- `subscription`-Tabelle: 4.630 Insert/Delete (jeder Client-Reconnect).

**5. Statistik-Auffälligkeit**
- **123.543 rolled-back transactions** seit Boot → es gibt einen Code-Pfad, der ständig fehlschlägt und rollbackt (jeder Rollback erzeugt WAL-IO).

## Maßnahmenplan (in Reihenfolge nach Aufwand/Nutzen)

### Stufe 1 — Sofort, größter Effekt, kein Risiko
1. **Cron-Frequenz halbieren** für die "jede Minute"-Jobs, die das nicht zwingend brauchen:
   - `ems-power-limit-scheduler`:  1 min → 5 min
   - `ems-dlm-scheduler`:          1 min → 2 min
   - `peak-shaving-scheduler`:     1 min → 5 min (Events werden ohnehin im Voraus geplant)
   - `ems-automation-scheduler`:   bleibt 1 min (zeitkritisch), aber Edge-Function-internes Skip-Logging einbauen, wenn nichts zu tun ist.
2. **`bridge_event_log` Cleanup auf hourly** statt daily (Tabelle wird sonst zu groß für effiziente Indexes).

### Stufe 2 — Schreibrate des Loxone-Workers entlasten
3. **`bridge_raw_samples` nur noch bei Wertänderung schreiben** (Dedup im Worker statt jedes Sample). Heute werden identische Werte mehrfach pro Sekunde geschrieben.
4. **`loxone_ws_session_log` Heartbeat-Update**: nur alle 5 min schreiben (heute alle ~30 s).
5. **Batch-Insert** in `bridge_raw_samples` (alle Samples eines `FLUSH_INTERVAL_MS` in einem einzigen INSERT statt N Einzel-Inserts) — drastische IO-Reduktion durch weniger WAL-Records.

### Stufe 3 — Rollback-Welle stoppen
6. **Finden und fixen, was 123 k Rollbacks erzeugt** — kandidiert sind: `ON CONFLICT`-INSERTs ohne passenden Constraint, fehlschlagende RLS-Checks, Edge-Functions mit doppelter `insert()`-Logik. Diagnose: `SELECT query, calls, rows FROM pg_stat_statements WHERE rows = 0 AND calls > 1000 ORDER BY calls DESC LIMIT 20;`

### Stufe 4 — Strukturell
7. **`meter_period_totals` nicht alle 5 min komplett refreshen**, sondern inkrementell (nur die seit letztem Lauf veränderten Buckets).
8. **OCPP-Cleanup-Batch verkleinern** (statt einmal täglich 120 k löschen → stündlich 5 k löschen, gleichmäßigere IO-Last).

## Erwartete Wirkung
- Stufe 1 allein: **~40 % weniger Cron-IO** (von 394 auf ~230 Läufe/h).
- Stufe 1+2: typischerweise zurück auf **< 60 % IO-Budget**.

## Was ich danach noch verifiziere
- 24 h nach Umsetzung erneut `supabase--slow_queries` + `pg_stat_user_tables` + `db_health` → vergleichen.

## Hinweis zur Cloud-Empfehlung im UI
Die Lovable-UI rät zur Instanz-Vergrößerung. Das **maskiert** das Problem (mehr IOPS verfügbar), behebt es aber nicht und verursacht laufende Mehrkosten. Empfehlung: erst Stufe 1–3 umsetzen, dann neu bewerten.
