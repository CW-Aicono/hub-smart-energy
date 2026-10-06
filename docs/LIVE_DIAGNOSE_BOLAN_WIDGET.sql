-- Live-Diagnose: Widgets ohne Werte + Änderungsprotokoll (nur lesend)
-- Im DB-Container ausführen:  psql -U postgres -d postgres -f LIVE_DIAGNOSE_BOLAN_WIDGET.sql

\echo '1) Ist die Gateway-Abholung eingeplant?'
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname ILIKE '%gateway-periodic-sync%';

\echo '2) Letzte 5 Läufe'
SELECT d.status, d.start_time, left(d.return_message, 120) AS msg
FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname ILIKE '%gateway-periodic-sync%' ORDER BY d.start_time DESC LIMIT 5;

\echo '3) Pausiert?'
SELECT * FROM public.worker_controls WHERE key IN ('gateway_periodic_sync','shelly_periodic_sync');

\echo '4) Bolan-Zähler: Zuordnung und letzter gespeicherter Wert'
SELECT m.name, m.capture_type, m.is_archived, m.sensor_uuid, m.source_unit_power,
       li.is_enabled AS integration_aktiv, i.type AS integration_typ,
       (SELECT max(recorded_at) FROM public.meter_power_readings p WHERE p.meter_id = m.id) AS letzter_rohwert,
       (SELECT max(bucket) FROM public.meter_power_readings_5min b WHERE b.meter_id = m.id) AS letzter_5min
FROM public.meters m
LEFT JOIN public.location_integrations li ON li.id = m.location_integration_id
LEFT JOIN public.integrations i ON i.id = li.integration_id
WHERE m.name ILIKE '%Hausanschluss%' AND m.name ILIKE ANY (ARRAY['%Prozessionsweg%','%Keplerweg%']);

\echo '5) Offene Integrationsfehler dazu'
SELECT created_at, error_type, left(error_message, 150) FROM public.integration_errors
WHERE is_resolved = false AND integration_type = 'shelly_cloud' ORDER BY created_at DESC LIMIT 10;

\echo '6) Änderungsprotokoll: Felder vorhanden?'
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='audit_logs' AND column_name IN ('entity_label','support_session_id');

\echo '7) Eingespielte Drizzle-Migrationen'
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 25;
