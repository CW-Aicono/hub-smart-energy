-- Tagessummen: Berliner Kalendertag statt UTC-Datum verwenden.
-- Zwischen 22:00 UTC (Berliner Mitternacht, Sommerzeit) und 00:00 UTC wurde der
-- neue Berliner Tag bisher nie berechnet -> Sankey/Kacheln blieben leer.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-meter-period-totals-5min'),
  command => $$SELECT public.refresh_meter_period_totals_5min(((now() AT TIME ZONE 'Europe/Berlin')::date - 1), (now() AT TIME ZONE 'Europe/Berlin')::date);$$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-meter-daily-totals'),
  command => $$SELECT public.refresh_meter_daily_totals(((now() AT TIME ZONE 'Europe/Berlin')::date - 3), (now() AT TIME ZONE 'Europe/Berlin')::date);$$
);

-- Sofort nachziehen, damit der laufende Berliner Tag nicht bis zum nächsten Lauf leer bleibt.
SELECT public.refresh_meter_period_totals_5min(((now() AT TIME ZONE 'Europe/Berlin')::date - 1), (now() AT TIME ZONE 'Europe/Berlin')::date);