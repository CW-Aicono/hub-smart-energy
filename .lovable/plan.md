# Tiefenanalyse: Warum steigt das Disk-IO-Budget weiter?

## TL;DR

Die bisherigen Maßnahmen waren **nicht wirkungslos, aber zu schwach**, weil sie die **eigentlichen IO-Treiber nicht angefasst haben**. Die Lastquellen sind woanders als vermutet. Zusätzlich sind durch die neuen Features (K6 DLM, K2 §14a, Stability-Score) **doppelte Cron-Jobs** entstanden, die im Minutentakt laufen. Es gibt 2-3 konkrete, kleine Code-Änderungen, die das IO-Budget messbar entlasten — **ohne Instance-Upgrade**.

---

## Befunde aus der Live-Datenbank

### 1. **Tabellenbloat (größter, ungelöster IO-Killer)**


| Tabelle                     | Größe auf Disk | Tatsächliche Zeilen | Bloat-Faktor |
| --------------------------- | -------------- | ------------------- | ------------ |
| `cron.job_run_details`      | **610 MB**     | 77.824              | hoch         |
| `net._http_response`        | **538 MB**     | **3.004**           | **~180×**    |
| `meter_power_readings_5min` | 386 MB         | 1.298.803           | ok           |
| `meter_power_readings`      | 229 MB         | 839.773             | ok           |
| `ocpp_message_log`          | 153 MB         | 244.921             | ok           |


→ `net._http_response` ist die **dramatischste Fehlquelle**: 3.000 Zeilen belegen 538 MB. Der tägliche Cleanup-Job (`cleanup-pg-net-daily`) löscht zwar, aber **VACUUM FULL läuft nie**, daher wird der Speicher nie freigegeben. Jeder Realtime-Scan dieser Tabelle (z. B. Edge-Function-Antworten) liest die toten Pages mit → IO-Verbrauch.

→ Bei `cron.job_run_details` dasselbe Muster: 1,52 Mio. gelöschte Zeilen, der freie Platz bleibt im Heap.

### 2. **Cron-Storm: doppelte Minuten-Jobs**

Aktuell laufen **gleichzeitig** im Minutentakt:

```
ems-automation-scheduler           */1  ✅ aktiv  (1440 Runs/24h)
ems-solar-charging-scheduler       */1  ✅ aktiv  (1440)
ems-power-limit-scheduler          */1  ✅ aktiv  (1440)
ems-loxone-periodic-sync           */1  ✅ aktiv  (1440)
ems-gateway-periodic-sync          */1  ✅ aktiv  (1440)
ems-dlm-scheduler                  */1  ✅ aktiv  (1440)
ems-cheap-charging-scheduler       */1  ✅ aktiv  (1440)
dlm-realtime-controller-every-min  */1  ✅ aktiv  (509 — schlägt teils fehl)
```

Macht ~**10.000 Edge-Function-Calls pro Tag**, die jeder eine vollständige Tenant-/Location-/Meter-/Integration-Auflösung machen.

Beweis: `tenants` (5 Zeilen) hatte **12,2 Mio. Seq-Scans**, `locations` (11 Zeilen) **2,0 Mio.**, `meters` (90 Zeilen) **564.000**, `integrations` (14 Zeilen) **5,16 Mio.**. Diese Seq-Scans entstehen in RLS-Policies, die bei jedem Function-Call neu evaluiert werden.

`dlm-realtime-controller-every-minute` und `ems-dlm-scheduler` machen **denselben Job** parallel — einer ist bei K6 dazugekommen, der andere blieb stehen.

### 3. `**integration_errors`: 28,27 Milliarden Tuple-Reads (!)**

Der partielle Index `idx_integration_errors_active WHERE is_resolved=false` wurde 1,55 Mio. Mal gescannt und lieferte dabei 28,3 Mrd. Zeilen zurück — d. h. **im Schnitt 18.000 offene Fehler pro Scan**. Das Auto-Resolve funktioniert offensichtlich nicht: 70.896 Live-Tupel, davon der Großteil unresolved. Jeder Polling-Tick eines UI-Widgets oder Scheduler-Jobs zieht die komplette Liste durch.

### 4. `**meter_power_readings_recorded_at_idx`: 7,13 Mrd. Heap-Fetches**

Der Index `(recorded_at)` allein (ohne `meter_id`) wird für "letzte N Stunden über alle Meter" verwendet. Mit 840 k Zeilen heißt jeder Range-Scan = viele Heap-Pages = viel Disk-IO. Index ist 21 MB, Heap 229 MB → fast jeder Scan landet auf Disk.

### 5. **Profiles-Seq-Scan-Storm**

`profiles` (15 Zeilen) hat **170,9 Mio. Seq-Scans** mit 1,11 Mrd. Tuple-Reads. Das ist RLS-Policy-Overhead in fast jeder authentifizierten Query.

---

## Warum stieg IO von 62% → 75%?

1. **K6 (DLM) + K2 (§14a)** haben neue Cron-Jobs und Webhook-Apply-Pfade eingeführt, die jede Minute laufen.
2. Der CP-Stability-Score (`charge_point_uptime_snapshots`) schreibt alle 5 Minuten 50.734 kumulative Inserts.
3. Der bestehende Bloat in `net._http_response` und `cron.job_run_details` wächst weiter.
4. Keiner der bisherigen Cleanup-Jobs macht `VACUUM FULL` oder `pg_repack`, der Heap-Bloat bleibt also vorhanden.

**Die bisherigen Maßnahmen** (vermutlich Index-Anpassungen / Query-Limits) griffen am falschen Ende: sie haben Logik optimiert, nicht das Bloat-Problem.

---

## Maßnahmen (priorisiert, niedrigster Aufwand zuerst)

### **P0 — Sofort, ohne Code-Änderung (eigene Migration)**

1. **Bloat zurückholen** (einmaliger Effekt: vermutlich −400 MB Disk-IO-Budget):
  - `VACUUM FULL net._http_response;` → erwartet: 538 MB → < 5 MB
  - `VACUUM FULL cron.job_run_details;` → erwartet: 610 MB → < 80 MB
  - Wichtig: muss **außerhalb einer Transaktion** laufen und sperrt die Tabelle kurz. Beide sind unkritisch.
2. **Aggressivere Retention** für die zwei Bloat-Quellen:
  - `cleanup-pg-net-daily`: Retention von z. B. 7 Tagen auf **24 h** runter
  - `cleanup-cron-history-daily`: Retention von 7 Tagen auf **48 h** runter
  - Beide laufen bereits, nur Parameter ändern.

### **P1 — Cron-Konsolidierung (10 Min Arbeit)**

3. **Doppelten DLM-Job deaktivieren**: `SELECT cron.unschedule('dlm-realtime-controller-every-minute');`
  (der `ems-dlm-scheduler` ruft denselben Edge-Controller intern auf)
4. **Minuten-Jobs auf 2-Minuten-Takt** wo fachlich vertretbar:
  - `ems-loxone-periodic-sync`, `ems-gateway-periodic-sync`, `ems-cheap-charging-scheduler`, `ems-solar-charging-scheduler` → `*/2 * * * *`
  - **Nicht** ändern: `ems-automation-scheduler`, `ems-power-limit-scheduler`, `ems-dlm-scheduler` (Echtzeit-Steuerung)
  - Effekt: −2880 Function-Calls/Tag = ca. −20 % DB-Last aus Cron

### **P2 — Integration-Errors aufräumen (15 Min)**

5. **Massen-Auto-Resolve** für stale Einträge:
  ```sql
   UPDATE integration_errors
     SET is_resolved = true, resolved_at = now()
     WHERE is_resolved = false
       AND last_seen_at < now() - interval '24 hours';
  ```
   Erwartet: ~60 k Zeilen schließen → Partial-Index schrumpft drastisch, jeder UI-Tick wird billiger.
6. **TTL-Cleanup-Job** ergänzen, der das täglich tut.

### **P3 — Query-Hotspots (nur falls IO nach P0–P2 noch hoch)**

7. `**meter_power_readings_recorded_at_idx` ersetzen** durch besseren Composite, wenn Top-Queries `WHERE recorded_at >= X` ohne `meter_id` nutzen — das müsste man dann mit `pg_stat_statements` (Extension einschalten lassen) verifizieren.
8. **Realtime-Subscriptions auf `meters`/`tenants`/`integrations**` prüfen — die 170 Mio. seq_scans auf `profiles` deuten auf eine RLS-Helper-Funktion ohne `STABLE`/`SECURITY DEFINER`-Caching hin.

---

## Was ich konkret als Build-Schritt vorschlage

Nur **P0 + P1 + P2** in einer einzigen Migration + Cron-Update:

```text
1. Migration:
   - VACUUM FULL net._http_response
   - VACUUM FULL cron.job_run_details
   - UPDATE integration_errors SET is_resolved=true WHERE last_seen_at < now()-'24h'
   - Anpassung der zwei cleanup-Funktionen (Retention)
   - cron.unschedule('dlm-realtime-controller-every-minute')
   - cron.alter_job(...) für 4 Loxone/Gateway-Jobs → */2

2. Keine UI/Code-Änderung nötig
```

Erwartung: IO-Budget fällt sofort um ~25–35 Punkte (zurück auf < 50 %), ohne Instance-Upgrade.

---

## Wichtige Einschränkung

`pg_stat_statements` ist **nicht aktiv** (Read-only-Transaktion verhindert das Aktivieren über diesen Tool-Zugang). Für eine **abschließende** Query-Identifikation müsste die Extension einmal in einer schreibenden Migration aktiviert werden. Ich kann das in derselben Migration mit hineinnehmen — möchtest du das?

## Frage an dich

Soll ich die Maßnahmen **P0 + P1 + P2** jetzt als eine Migration umsetzen, oder zuerst nur P0 (reines Aufräumen) und das Ergebnis abwarten? Letzteres ist sicherer, aber zwei Iterationen statt einer.  
  
Antwort: Ja, jetzt P0 + P1 + P2 in einer Migration umsetzen bitte