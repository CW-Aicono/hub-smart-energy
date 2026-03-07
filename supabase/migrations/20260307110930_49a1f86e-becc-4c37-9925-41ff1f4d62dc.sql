-- Delete incorrectly imported backfill period totals
DELETE FROM public.meter_period_totals WHERE source = 'loxone_backfill';
