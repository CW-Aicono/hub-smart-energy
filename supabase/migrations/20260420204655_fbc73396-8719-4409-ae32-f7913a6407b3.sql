-- Historische Messdaten beim Löschen einer Messstelle erhalten:
-- FK von ON DELETE CASCADE auf ON DELETE SET NULL umstellen.
-- Dafür müssen die meter_id-Spalten nullable sein.

ALTER TABLE public.meter_readings ALTER COLUMN meter_id DROP NOT NULL;
ALTER TABLE public.meter_readings DROP CONSTRAINT IF EXISTS meter_readings_meter_id_fkey;
ALTER TABLE public.meter_readings
  ADD CONSTRAINT meter_readings_meter_id_fkey
  FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;

ALTER TABLE public.meter_period_totals ALTER COLUMN meter_id DROP NOT NULL;
ALTER TABLE public.meter_period_totals DROP CONSTRAINT IF EXISTS meter_period_totals_meter_id_fkey;
ALTER TABLE public.meter_period_totals
  ADD CONSTRAINT meter_period_totals_meter_id_fkey
  FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;

ALTER TABLE public.meter_power_readings ALTER COLUMN meter_id DROP NOT NULL;
ALTER TABLE public.meter_power_readings DROP CONSTRAINT IF EXISTS meter_power_readings_meter_id_fkey;
ALTER TABLE public.meter_power_readings
  ADD CONSTRAINT meter_power_readings_meter_id_fkey
  FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;

ALTER TABLE public.meter_power_readings_5min ALTER COLUMN meter_id DROP NOT NULL;
ALTER TABLE public.meter_power_readings_5min DROP CONSTRAINT IF EXISTS meter_power_readings_5min_meter_id_fkey;
ALTER TABLE public.meter_power_readings_5min
  ADD CONSTRAINT meter_power_readings_5min_meter_id_fkey
  FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;

ALTER TABLE public.pv_actual_hourly ALTER COLUMN meter_id DROP NOT NULL;
ALTER TABLE public.pv_actual_hourly DROP CONSTRAINT IF EXISTS pv_actual_hourly_meter_id_fkey;
ALTER TABLE public.pv_actual_hourly
  ADD CONSTRAINT pv_actual_hourly_meter_id_fkey
  FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;

-- alert_rules und virtual_meter_sources dürfen weiterhin kaskadieren,
-- da sie reine Konfiguration ohne historische Messwerte enthalten.
