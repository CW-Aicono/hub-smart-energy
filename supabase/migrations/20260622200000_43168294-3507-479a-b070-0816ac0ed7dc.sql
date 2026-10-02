-- Cron-Drift-Fix: Diese Jobs liefen bisher NUR live in staging (direkt im
-- Studio-UI angelegt, nie als Migration versioniert) und sind daher nie nach
-- Prod gelangt, obwohl die zugehoerigen Edge Functions/SQL-Funktionen laengst
-- existieren. Migriert sie 1:1 (gleicher Name, gleicher Schedule) ins Repo.
--
-- Bonus: die alten Jobs riefen Edge Functions mit hart codiertem JWT im
-- Job-Body auf (sichtbar fuer jeden mit Lesezugriff auf cron.job). Wir nutzen
-- stattdessen private.invoke_edge_function(), das den Key aus
-- private.cron_settings liest - kein Secret mehr im Job-Text.

DO $mig$
DECLARE
  job_name text;
  jobs text[] := ARRAY[
    'generate-monthly-invoices',
    'send-monthly-charging-invoices',
    'lexware-sync-status-hourly',
    'ppa-alert-check-daily',
    'ppa-report-generate-monthly',
    'ppa-settlement-monthly',
    'send-scheduled-reports',
    'peak-shaving-event-prep-10min',
    'peak-shaving-monthly-report',
    'peak-shaving-scheduler-every-minute',
    'charge-point-auto-reboot-hourly',
    'collect-infra-metrics-15min',
    'compute-daily-totals',
    'dlm-control-log-cleanup-daily',
    'cleanup-old-ocpp-logs',
    'cleanup-bridge-raw-samples-hourly',
    'vacuum-power-readings-buffer',
    'brighthub-daily-meter-sync',
    'bridge-aggregator-every-5min',
    'aggregate-pv-actual-hourly',
    -- Loxone-Konsolidierung (Migration 20260619071239 wollte das schon erledigen,
    -- der 15-Min-Alt-Job lief in staging aber unbemerkt weiter):
    'loxone-periodic-sync-15min',
    'ems-loxone-periodic-sync'
  ];
BEGIN
  FOREACH job_name IN ARRAY jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
      PERFORM cron.unschedule(job_name);
    END IF;
  END LOOP;
END $mig$;

-- Rechnungen / Lexware
SELECT cron.schedule('generate-monthly-invoices', '0 2 1 * *',
  $$SELECT private.invoke_edge_function('generate-monthly-invoices');$$);
SELECT cron.schedule('send-monthly-charging-invoices', '0 6 1 * *',
  $$SELECT private.invoke_edge_function('send-charging-invoices');$$);
SELECT cron.schedule('lexware-sync-status-hourly', '0 * * * *',
  $$SELECT private.invoke_edge_function('lexware-sync-status');$$);

-- PPA
SELECT cron.schedule('ppa-alert-check-daily', '30 6 * * *',
  $$SELECT private.invoke_edge_function('ppa-alert-check', '{"trigger":"cron"}'::jsonb);$$);
SELECT cron.schedule('ppa-report-generate-monthly', '0 4 3 * *',
  $$SELECT private.invoke_edge_function('ppa-report-generate', '{"trigger":"cron","all_finalized_last_month":true}'::jsonb);$$);
SELECT cron.schedule('ppa-settlement-monthly', '15 3 2 * *',
  $$SELECT private.invoke_edge_function('ppa-settlement-calculate');$$);

-- Reports
SELECT cron.schedule('send-scheduled-reports', '0 5 * * *',
  $$SELECT private.invoke_edge_function('send-scheduled-report');$$);

-- Peak-Shaving
SELECT cron.schedule('peak-shaving-event-prep-10min', '*/10 * * * *',
  $$SELECT private.invoke_edge_function('peak-shaving-event-prep', jsonb_build_object('ts', now()));$$);
SELECT cron.schedule('peak-shaving-monthly-report', '0 6 1 * *',
  $$SELECT private.invoke_edge_function('peak-shaving-report', '{"mode":"monthly_cron"}'::jsonb);$$);
SELECT cron.schedule('peak-shaving-scheduler-every-minute', '*/5 * * * *',
  $$SELECT private.invoke_edge_function('peak-shaving-scheduler', jsonb_build_object('ts', now()));$$);

-- Ladepunkte / Infra
SELECT cron.schedule('charge-point-auto-reboot-hourly', '5 * * * *',
  $$SELECT private.invoke_edge_function('charge-point-auto-reboot');$$);
SELECT cron.schedule('collect-infra-metrics-15min', '*/15 * * * *',
  $$SELECT private.invoke_edge_function('collect-metrics');$$);

-- Wartung (reine SQL-Funktionen, kein Edge-Function-Call)
SELECT cron.schedule('compute-daily-totals', '15 0 * * *',
  $$SELECT public.compute_daily_totals_from_5min();$$);
SELECT cron.schedule('dlm-control-log-cleanup-daily', '15 3 * * *',
  $$delete from public.dlm_control_log where executed_at < now() - interval '30 days';$$);
SELECT cron.schedule('cleanup-old-ocpp-logs', '0 3 * * *',
  $$SELECT public.cleanup_old_ocpp_logs();$$);
SELECT cron.schedule('cleanup-bridge-raw-samples-hourly', '17 * * * *',
  $$SELECT public.cleanup_bridge_raw_samples();$$);
SELECT cron.schedule('vacuum-power-readings-buffer', '30 3 * * *',
  $$VACUUM (ANALYZE) public.meter_power_readings;$$);

-- BrightHub / Bridge / PV
SELECT cron.schedule('brighthub-daily-meter-sync', '0 2 * * *',
  $$SELECT private.invoke_edge_function('brighthub-periodic-sync', '{"action":"sync_meters"}'::jsonb);$$);
SELECT cron.schedule('bridge-aggregator-every-5min', '*/5 * * * *',
  $$SELECT private.invoke_edge_function('bridge-aggregator');$$);
SELECT cron.schedule('aggregate-pv-actual-hourly', '5 * * * *',
  $$SELECT private.invoke_edge_function('aggregate-pv-actual-hourly', jsonb_build_object('time', now()));$$);

-- Loxone-Konsolidierung: nur die 2-Min-Variante bleibt aktiv, der 15-Min-Alt-Job
-- bleibt unscheduled (s. DO-Block oben).
SELECT cron.schedule('ems-loxone-periodic-sync', '*/2 * * * *',
  $$SELECT private.invoke_edge_function('loxone-periodic-sync');$$);
