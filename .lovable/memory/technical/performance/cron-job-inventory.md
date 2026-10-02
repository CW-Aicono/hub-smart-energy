---
name: Cron-Job-Inventar und Kollisionsfreiheit
description: Regeln für pg_cron-Zeitpläne nach dem Audit vom 2026-07-31 — eindeutige Minuten-Offsets, Advisory-Locks, keine toten Jobs
type: feature
---
Audit 2026-07-31: von 59 Jobs waren 9 dauerhaft deaktiviert (Altlasten des `ems-cron-bundle`) und wurden per `cron.unschedule` entfernt. Stand danach: 50 Jobs, keine Zeitplan-Kollision.

Regeln für neue oder geänderte Jobs:
- Vor jeder Änderung `select schedule, string_agg(jobname,', ') from cron.job where active group by schedule having count(*)>1` ausführen — Ergebnis muss leer bleiben.
- Niemals Minute 0 oder 30 für stündliche Jobs verwenden; hochfrequente Aufgaben gehören in `public.run_ems_cron_bundle()`.
- Belegte Stundenminuten: 5, 7, 15, 17, 19, 21/51, 23, 27, 29, 33 sowie die 15-Minuten-Gruppen 6, 8, 9, 11, 13.
- Nachtfenster: Löschjobs 00:00–03:59, VACUUM/ANALYZE erst ab 04:00 (`vacuum-power-readings-buffer` 04:30, `mdtm-vacuum-nightly` 04:15). VACUUM nie parallel zu Löschjobs.
- Lange SQL-Wartungsläufe laufen über `public.guarded_*`-Wrapper mit `pg_try_advisory_xact_lock`: `guarded_rollup_sensor_hourly`, `guarded_rollup_meter_power_hourly`, `guarded_cleanup_bridge_raw_samples`, `guarded_cleanup_sensor_readings_raw`.
- `public.cron_schedule_collisions()` existiert als Prüffunktion (nur privilegierte Rollen).
- `ems-rollup-power-hourly` läuft seit dem Audit stündlich (vorher alle 10 Minuten, Rest der Backfill-Phase).
