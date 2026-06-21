## Befund: Du hast recht — wir haben an der falschen Seite optimiert

Die Live-Daten aus der DB bestätigen deine Vermutung zu 100 %. Das "Disk IO Budget" misst Read **und** Write, und der Engpass liegt fast komplett auf der Schreibseite. Die bisherigen Read-Fixes (BRIN, VACUUM FULL, MV-Visibility) berühren diesen Hebel nicht — daher die 74 % ohne jede Bewegung.

### Was die Datenbank gerade wirklich macht

Aus `pg_stat_statements` (sortiert nach Dirty-Blocks + WAL):


| #   | Statement                                        | Calls         | Dirty Blocks   | WAL         |
| --- | ------------------------------------------------ | ------------- | -------------- | ----------- |
| 1   | `INSERT INTO meter_power_readings` (PostgREST)   | **5.13 Mio.** | **14.16 Mio.** | **63.3 GB** |
| 2   | `INSERT INTO ocpp_message_log` (PostgREST)       | **1.03 Mio.** | 1.32 Mio.      | 6.7 GB      |
| 3   | `compact_power_readings_day()`                   | 105           | 599 k          | 5.0 GB      |
| 4   | `INSERT … meter_period_totals` ON CONFLICT       | 659 k         | 394 k          | 5.0 GB      |
| 5   | `INSERT … meter_power_readings_5min` ON CONFLICT | 34 k          | …              | …           |


**Hebel #1 allein erzeugt ~75 % der WAL-Bytes und ~80 % der Dirty Blocks.** Das ist das IO-Budget.

Zusätzliche Indikatoren:

- Memory 62 %, Disk 16 %, Connections 18/60, **0 Restarts** → kein RAM/Connection-Problem, kein Crash → Instance-Upgrade wäre wieder die falsche Antwort.
- 5,3 k temp_files / 20 GB temp_bytes → ein paar große Sorts (eher `compact_power_readings_day`).
- `bridge_event_log`: 32 k Inserts ohne Vacuum (autovacuum_count 9 aber wenige) — Nebenrolle.

### Warum die 74 % „eingefroren" wirken

Es sind keine echten Live-IOPS, sondern ein **rollender Aggregat-Indikator** über mehrere Stunden/Tage. Solange der Schreibstrom konstant weiterläuft (jede Sekunde neue `meter_power_readings`-Inserts), bleibt der Wert klebrig — egal wie viele Reads wir wegoptimieren.

---

## Plan: Schreib-IO am Hebel #1 reduzieren (ohne Datenverlust)

### Schritt A — Verifikation, was die 5,13 Mio. Inserts erzeugt (read-only, 5 Min)

1. Per `pg_stat_statements` prüfen, ob es genau **ein** Caller-Pattern ist (PostgREST `?on_conflict=…` oder plain INSERT) → wir wissen es bereits: PostgREST-Bulk-Insert ohne ON CONFLICT.
2. Im Code: alle Aufrufstellen von `from('meter_power_readings').insert(...)` listen (Edge Functions + Worker + Gateway-Ingest) und die Insert-Frequenz/Batch-Größe pro Quelle ermitteln.
3. Pro Quelle Calls/Tag × Rows/Call gegenrechnen → wir identifizieren, wer wirklich 5 Mio. Inserts/Tag schiebt.

Erwartete Hauptverdächtige: `gateway-ingest`, Loxone-Worker, EMS-Worker — vermutlich pro Sensor **alle 5–10 s eine eigene Zeile** statt Batch.

### Schritt B — Write-Amplification senken

Drei orthogonale Maßnahmen, einzeln messbar:

**B1 — Batching am Ingest-Endpoint** (größter Effekt, geringes Risiko)

- Worker sammeln Messwerte 30–60 s clientseitig und schicken **einen** Bulk-Insert statt N Einzel-Inserts.
- Senkt Calls, WAL-Overhead pro Row (FPI/Tuple-Header), Index-Updates und HTTP-Round-Trips gleichzeitig.
- Erwartung: 5–10× weniger WAL bei gleichem Datenvolumen.

**B2 — Throttling/Deduplication redundanter Werte**

- Wenn ein Sensor 4 Werte/Minute mit identischem Power-Value liefert, nur den ersten + Change-Events speichern (oder 1×/Min Aggregate). Das halbiert bis viertelt die Row-Anzahl.
- Optional: Insert nur, wenn |neuer - letzter| > Schwelle ODER ≥60 s seit letztem.

**B3 — `meter_power_readings` als UNLOGGED-Staging + periodischer Move** (nur falls B1+B2 nicht reichen)

- Heißes 5-Min-Fenster in UNLOGGED-Tabelle (kein WAL), via Cron alle 5 Min aggregiert in `meter_power_readings_5min` mergen, Roh-Rows verwerfen oder seltener persistieren.
- Höheres Architektur-Risiko (Datenverlust bei Crash im 5-Min-Fenster) — daher zuletzt.

### Schritt C — Hebel #2 `ocpp_message_log`

- 1,03 Mio. INSERTs/Rolling-Window für reine Protokoll-Logs.
- Filter im OCPP-Server: `Heartbeat`, `StatusNotification` ohne State-Change und `MeterValues` nicht roh persistieren — nur Fehler/CallError und State-Changes loggen.
- Erwartung: −70 bis −90 % Inserts, ohne dass `charge_point_uptime_snapshots` oder Billing leidet (die ziehen aus separaten Tabellen).
- Memory dazu existiert bereits: *EV Log Maintenance* (CALLERROR-Filter, 30-Tage-Cleanup) — das ist die Retention; was hier fehlt, ist das **Insert-seitige** Filtern.

### Schritt D — Verifikation

Nach jedem Teilschritt (B1, B2, C) parallel messen:

- `pg_stat_statements`: Dirty Blocks + WAL für genau diese 2 Statements (Delta).
- `pg_stat_database.tup_inserted` Rate.
- IO-Budget-Anzeige im Dashboard nach 6–12 h erneut.

**Abbruchkriterium / Hard-Stop-Regel:** Wenn nach B1+B2+C die Anzeige weiterhin exakt 74 % zeigt, ist die Metrik selbst stale/kaputt — dann nicht weiter optimieren, sondern Lovable explizit fragen, wie der Wert berechnet wird (genau wie du vorschlägst).

---

## Was ich **nicht** vorschlage

- Kein Instance-Upgrade (RAM/CPU/Connections sind entspannt; das wäre Geldverbrennung gegen ein Write-Volumen-Problem).
- Kein weiteres VACUUM FULL.
- Keine neuen Indizes (würden Writes noch teurer machen).

---

## Reihenfolge & geschätzter Effekt


| Schritt        | Aufwand           | Risiko | Erwarteter WAL-Drop       |
| -------------- | ----------------- | ------ | ------------------------- |
| A Verifikation | 15 Min            | 0      | —                         |
| B1 Batching    | 1–2 h Worker-Code | gering | **−60 bis −80 %**         |
| B2 Dedup       | 1 h               | gering | zusätzlich −30 %          |
| C OCPP-Filter  | 30 Min            | gering | −5–10 % gesamt            |
| B3 UNLOGGED    | halber Tag        | mittel | optional, nur falls nötig |


Wenn du grünes Licht gibst, starte ich mit Schritt A (Code-Audit, wer die 5,13 Mio. Inserts erzeugt) und melde mich mit konkreten Zahlen pro Quelle, **bevor** ich an Code/Worker rangehe.  
  
Antwort: beachte dabei, dass wir vor ca. 20 Stunden keine Meter Readings mehr bekommen, da wir alle Worker pausiert haben. Zumindest im Dashboard werden auch keine Werte mehr angezeigt. Weder Shelly oder loxone, noch AICONO-Gateway oder andere Gateways liefern noch werte. Bitte bestätige das nochmals.   
  
  
  
  
  