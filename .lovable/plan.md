## Tiefenanalyse Disk-I/O (90 %)

Aus `pg_stat_statements` (kumulativ seit letztem Boot) ergeben sich die Top-Verursacher von Disk-I/O. Reihenfolge nach **gesamter Ausführungszeit**:


| #   | Query (vereinfacht)                                                     | Aufrufe        | Σ Zeit       | Bemerkung                                                                            |
| --- | ----------------------------------------------------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------ |
| 1   | `INSERT meter_power_readings`                                           | **5.130.762**  | **23.247 s** | Roh-Insert pro Gateway-Poll. Jeder Insert = WAL + Index-Update                       |
| 2   | `UPDATE location_integrations SET last_sync_at, sync_status WHERE id=…` | **2.333.740**  | **21.832 s** | 11 Zeilen, 2,3 Mio Updates → extrem viele „Hot-Row"-Updates → WAL + Autovacuum-Sturm |
| 3   | `SELECT meter_power_readings ORDER BY recorded_at LIMIT/OFFSET`         | 157.431        | 8.767 s      | EnergyChart / Reports                                                                |
| 4   | `SELECT integration_errors WHERE is_resolved OR is_ignored`             | 92.451         | 8.282 s      | Auto-Resolve-Loop                                                                    |
| 5   | `SELECT meter_power_readings ORDER BY power_value DESC LIMIT`           | 8.327          | 5.599 s      | „Max-Wert finden" — voller Index-Scan ohne passenden Index, **672 ms/Call**          |
| 6   | `INSERT ocpp_message_log`                                               | **1.033.902**  | 3.485 s      | **Jede** OCPP-WS-Nachricht wird geloggt                                              |
| 7   | `UPSERT meter_period_totals`                                            | 658.181        | 2.739 s      | Tages-/Wochensummen-Updates                                                          |
| 8   | `UPSERT gateway_sensor_snapshots`                                       | 293.119        | 2.638 s      | Sensor-Snapshot pro Liegenschaft                                                     |
| 9   | `UPDATE integration_errors SET is_resolved` (mehrere Varianten)         | **~1.061.000** | ~6.700 s     | Auto-Resolve sweep loop                                                              |
| 10  | `SELECT pending_ocpp_commands`                                          | 2.078.153      | 707 s        | Polling-Schleife für Ladepunkte                                                      |


Belege:

- `location_integrations`: 11 Live-Zeilen → **11 Autovacuum + 11 Autoanalyze** in kürzester Zeit (Tabelle wird ständig totgeschrieben → WAL-Bloat → Disk-I/O).
- `meter_power_readings`: 95.104 Disk-Reads in laufender Boot-Session (= Tabellen-Scans aus den Chart-Queries, weil OFFSET-Pagination ineffizient ist).
- Aktuell läuft **keine** Long-Running-Query (1 h Realtime-WAL-Sender ist normal). Der I/O-Anstieg kommt also nicht von einer einzelnen Edge Function, sondern von **dauerhafter Hintergrundlast** der oben gelisteten Patterns.

## Vermutung Root-Cause

Es gibt **drei strukturelle Schreib-Stürme**, die zusammen das I/O-Budget auffressen:

**A) `location_integrations`-Hot-Row-Update bei jedem Gateway-Poll**
Jeder periodic-sync schreibt `last_sync_at` + `sync_status` auf dieselbe Zeile. 11 Zeilen × ~3.500 Polls/Tag × Tage = mehrere Millionen Updates. Jedes Update = neue Heap-Version + neue Index-Einträge + WAL + irgendwann Autovacuum. Das ist die Nr. 1 für Disk-Write-I/O.

**B) `ocpp_message_log` loggt jede einzelne WebSocket-Nachricht**
1 Mio Inserts. Bei OCPP-Heartbeats alle 30 s pro Ladepunkt summiert sich das massiv. Es gibt zwar bereits eine 30-Tage-Aufräum-Logik, aber das Schreiben selbst ist die Belastung.

**C) Integration-Errors Auto-Resolve-Sweeps**
Die Auto-Resolve-Logik durchsucht/aktualisiert die Tabelle in mehreren Varianten ~1 Mio. Mal. Jeder Sweep ist ein Index-Scan + WAL-Update.

## Plan: drei chirurgische Fixes (alle ohne Risiko, alle credit-arm)

### Fix 1 — `location_integrations`-Update drosseln (größter Effekt)

Statt bei jedem Poll `last_sync_at` zu schreiben, nur noch schreiben wenn:

- `sync_status` sich **wirklich geändert** hat, **ODER**
- der letzte Update > 5 min her ist.

→ reduziert die 2,3 Mio Updates auf <100 k. **Geschätzte Disk-Write-Ersparnis: 60–70 %.**

Umsetzung: in `loxone-periodic-sync` / Gateway-Heartbeat-Edge-Functions die Update-Bedingung ergänzen. Keine Migration, kein Schema-Change.

### Fix 2 — `ocpp_message_log` nur bei Fehler oder selten loggen

Optionen (du wählst):

- **a)** Nur `CALLERROR`, `BootNotification`, `StartTransaction`, `StopTransaction`, `StatusNotification`, `Authorize` loggen. `Heartbeat` und `MeterValues` ausschließen.
- **b)** Komplett auf Fehler-Only umschalten.

→ reduziert die 1 Mio Inserts auf <50 k. **Geschätzte Write-Ersparnis: 15–20 %.**

### Fix 3 — Integration-Errors Auto-Resolve weniger oft & gezielter

- Sweep nur 1×/min statt bei jedem Poll.
- WHERE-Klausel um `updated_at > now() - interval '15 min'` einschränken, damit nicht 75.000 Altzeilen bei jedem Sweep gescannt werden.

→ reduziert die ~1 Mio Updates und 92 k SELECTs deutlich. **Geschätzte Write-Ersparnis: 5–10 %.**

## Was NICHT gemacht wird

- Kein Schema-Change, kein Reindex, kein neuer Index — die vorhandenen Indizes reichen.
- Keine Migration, kein Datenverlust.
- Kein Refactor der Charts (kommt erst, wenn die drei Storm-Quellen weg sind und das Bild stabil ist).

## Vorgehen

Ich würde **Fix 1 zuerst** umsetzen (größter Hebel, kleinste Änderung) und dann nach 30 min wieder ins Disk-I/O-Budget schauen. Wenn das schon reicht, sparen wir uns Fix 2 und 3.

**OK, Fix 1 jetzt umsetzen?** (Edge Functions: `loxone-periodic-sync` und ggf. weitere periodic-sync-Funktionen. Eine kleine `if`-Bedingung vor dem `update()`-Call.)  
  
Ja, ok für Fix 1. Die Punkte Fix 2 und Fix 3 behandeln wir danach separat nochmal