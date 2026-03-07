-- Delete outlier backfill entries at midnight boundaries
DELETE FROM public.meter_power_readings_5min
WHERE bucket = '2026-03-06T00:00:00Z'
AND power_avg > 1000;

-- Also fix affected daily totals
DELETE FROM public.meter_period_totals
WHERE period_start = '2026-03-06'
AND source = 'loxone_backfill';