
ALTER TABLE public.alert_rules 
ADD COLUMN threshold_unit text NOT NULL DEFAULT 'kWh',
ADD COLUMN time_unit text NOT NULL DEFAULT 'month';
