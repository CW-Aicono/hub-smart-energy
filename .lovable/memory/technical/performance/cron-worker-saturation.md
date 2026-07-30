---
name: Cron-Worker-Sättigung (Backend-Downtime-Ursache)
description: Wiederkehrende Backend-Ausfälle durch gleichzeitig startende pg_cron-Jobs; Schedules müssen gestaffelt sein
type: feature
---
Ursache wiederkehrender Backend-/Login-Ausfälle: Dutzende pg_cron-Jobs starten zur selben Minute (`*/5`, `*/2`, `*/15` alle auf Minute 0). Bei `max_connections=60` und `max_worker_processes=6` führt das zu `job startup timeout` und Connection-Sättigung → Auth/REST-Timeouts.

Regel: Neue oder geänderte Cron-Jobs NIEMALS als `*/N * * * *` anlegen, sondern immer mit Offset staffeln, z. B. `3-59/5 * * * *`. Vor dem Anlegen prüfen, welche Minuten bereits belegt sind (`select jobname, schedule from cron.job where active`).

Diagnose-Query bei Ausfall:
`select j.jobname, d.status, d.start_time, d.return_message from cron.job_run_details d join cron.job j using(jobid) where d.status<>'succeeded' order by d.start_time desc limit 30;`
