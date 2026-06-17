
SELECT cron.schedule(
  'refresh-meter-daily-totals',
  '15 0 * * *',
  $$SELECT public.refresh_meter_daily_totals((CURRENT_DATE - 3)::date, CURRENT_DATE);$$
);
SELECT cron.schedule(
  'refresh-meter-weekly-totals',
  '30 0 * * *',
  $$SELECT public.refresh_meter_weekly_totals((CURRENT_DATE - 35)::date, CURRENT_DATE);$$
);
SELECT cron.schedule(
  'refresh-meter-monthly-totals',
  '35 0 * * *',
  $$SELECT public.refresh_meter_monthly_totals((CURRENT_DATE - 65)::date, CURRENT_DATE);$$
);
