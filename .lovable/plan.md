# Plan: Gestoppte Cron-Jobs analysieren und sicher wieder starten

## Ausgangslage

Beim letzten Backend-Ausfall wurden zwei problematische Cron-Jobs gestoppt:

- **Job 109** `run_ems_cron_bundle()` — minütlicher Sammeljob
- **Job 70** `guarded_cleanup_bridge_raw_samples()` — Cleanup-Job für Bridge-Rohdaten

Derzeit sind beide **inaktiv**. Das Backend ist stabil (13/60 Verbindungen, 57 % Speicher, 29 % Festplatte). Sie laufen **nicht automatisch wieder an**, solange sie nicht neu eingeplant werden.

## Was machten die gestoppten Jobs?

### Job 109 — `run_ems_cron_bundle()` (jede Minute)

Dieser Job war ein Sammel-Scheduler, der jede Minute mehrere Edge Functions und Datenbankfunktionen aufruft:

- **Immer (jede Minute):**
  - `automation-scheduler` — Cloud-Automatisierungen ausführen
- **Gerade Minuten:**
  - `gateway-periodic-sync` — Gateway-Synchronisation
  - `cheap-charging-scheduler` — günstiges Laden planen
- **Ungerade Minuten:**
  - `dlm-scheduler` — dynamisches Lastmanagement
  - `solar-charging-scheduler` — PV-Überschussladen
- **Modulo 5 Minuten:**
  - `bridge-aggregator` (0)
  - `brighthub-periodic-sync` (1)
  - `power-limit-scheduler` + `peak-shaving-scheduler` (2)
  - `collect_db_metrics` + `sensor-history-aggregator` (3)
  - `evaluate_monitoring_rules` + `snapshot_charge_point_uptime` (4)

Der Job hat bereits ein `pg_try_advisory_xact_lock`, um Mehrfachläufe zu verhindern, aber die vielen synchronen `net.http_post`-Aufrufe in schneller Folge konnten die Verbindungen/Timeouts blockieren, wenn Edge Functions lange brauchten.

### Job 70 — `guarded_cleanup_bridge_raw_samples()`

Löscht/verdichtet alte Rohsamples der Bridge-Worker. Lief beim letzten Mal in einen "job startup timeout", weil die Datenbank zu dem Zeitpunkt bereits gesättigt war.

## Können wir sie wieder starten?

**Ja, aber nicht beide auf einmal und nicht ohne Absicherungen.**

Vorschlag für einen schrittweise Wiederanlauf:

1. **Keine vollständige Wiederherstellung des alten Bundles.** Stattdessen: Bundle aufsplitten oder Laufzeitbegrenzungen einbauen.
2. **Zuerst nur den Cleanup-Job (Job 70) wieder aktivieren**, weil er keine externen HTTP-Aufrufe macht und das Datenaufkommen reduziert.
3. **Danach die Edge-Function-Aufrufe aus dem Bundle in separate, zeitlich versetzte Cron-Jobs verteilen**, statt sie alle in einer einzigen Minute zu starten.
4. **Für jeden neuen Job ein Statement-Timeout und ein Advisory-Lock setzen**, damit ein hängender Aufruf nicht alle Verbindungen blockiert.
5. **Monitoring einrichten**: Mindestens ein simpler Check, der innerhalb von 10 Minuten nach Wiederanlauf prüft, ob `pg_stat_activity` wieder ansteigt.

## Konkrete Maßnahmen

### Kurzfristig (sofort umsetzbar)

- Cleanup-Job `guarded_cleanup_bridge_raw_samples()` wieder einschalten, aber nur alle 10 Minuten statt jede Minute (falls er vorher häufiger lief).
- Den Bundle-Job **nicht** 1:1 wieder aktivieren.

### Mittelfristig (empfohlen)

- `run_ems_cron_bundle()` ersetzen durch einzelne Cron-Jobs mit gestaffeltem Intervall, z. B.:
  - `automation-scheduler` alle 2 Minuten
  - `gateway-periodic-sync` alle 5 Minuten
  - `cheap-charging-scheduler` alle 5 Minuten
  - `dlm-scheduler` alle 5 Minuten
  - `solar-charging-scheduler` alle 5 Minuten
  - `bridge-aggregator` alle 5 Minuten
  - `brighthub-periodic-sync` alle 5 Minuten
  - `power-limit-scheduler` alle 5 Minuten
  - `peak-shaving-scheduler` alle 5 Minuten
  - `sensor-history-aggregator` alle 5 Minuten
  - `evaluate_monitoring_rules` alle 5 Minuten
  - `snapshot_charge_point_uptime` alle 5 Minuten
  - `collect_db_metrics` alle 5 Minuten
- Jedem einzelnen Job ein `SET statement_timeout` geben (z. B. 30 s).
- Alle Edge-Function-Aufrufe über `pg_net`/`net.http_post` mit einem kurzen Timeout absichern.

### Monitoring

- Nach dem Wiederanlauf 10 Minuten lang `pg_stat_activity` beobachten.
- Falls `active_connections` > 45 oder wiederholt Timeouts auftreten, sofort stoppen.

## Entscheidungsfrage an dich

Soll ich:

1. **Nur den Cleanup-Job wieder aktivieren** (geringes Risiko), oder
2. **Den Bundle-Job in separate, zeitlich verteilte Jobs aufteilen** und dann schrittweise wieder aktivieren (mehr Aufwand, aber stabiler langfristig)?
