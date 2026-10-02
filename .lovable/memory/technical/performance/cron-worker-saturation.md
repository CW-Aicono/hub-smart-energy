---
name: Cron-Worker-Sättigung (Backend-Downtime-Ursache)
description: Wiederkehrende Backend-Ausfälle durch gleichzeitig startende pg_cron-Jobs; Schedules müssen gestaffelt sein
type: feature
---
Ursache wiederkehrender Backend-/Login-Ausfälle: Dutzende pg_cron-Jobs starten zur selben Minute (`*/5`, `*/2`, `*/15` alle auf Minute 0). Bei `max_connections=60` und `max_worker_processes=6` führt das zu `job startup timeout` und Connection-Sättigung → Auth/REST-Timeouts.

Regel: Neue hochfrequente Aufgaben nicht als eigenständige `*/N * * * *`-Jobs anlegen. Sie werden über `public.run_ems_cron_bundle()` in einem einzigen Minutenjob seriell und mit Advisory-Lock ausgeführt. Separate Wartungsjobs müssen einen eindeutigen Offset und einen Overlap-Guard haben. Vor Änderungen immer `select jobname, schedule from cron.job where active` prüfen.

Seit 2026-07-31 ersetzt `ems-cron-bundle` die zuvor kollidierenden Automation-, Gateway-, Charging-, Monitoring- und Sensor-Jobs. `ems-backfill-power-hourly` läuft separat mit Advisory-Lock und entfernt sich automatisch, sobald kein Backfill mehr anfällt.

Diagnose-Query bei Ausfall:
`select j.jobname, d.status, d.start_time, d.return_message from cron.job_run_details d join cron.job j using(jobid) where d.status<>'succeeded' order by d.start_time desc limit 30;`
