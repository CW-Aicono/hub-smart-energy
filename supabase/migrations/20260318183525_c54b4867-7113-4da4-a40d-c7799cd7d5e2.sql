ALTER TABLE public.pv_forecast_settings
ADD COLUMN IF NOT EXISTS recalibration_locked boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS recalibration_locked_until timestamptz,
ADD COLUMN IF NOT EXISTS recalibration_baseline_started_at timestamptz;

UPDATE public.pv_forecast_settings
SET performance_ratio = 0.80,
    recalibration_locked = true,
    recalibration_baseline_started_at = COALESCE(recalibration_baseline_started_at, now()),
    recalibration_locked_until = COALESCE(recalibration_locked_until, now() + interval '14 days')
WHERE is_active = true;

COMMENT ON COLUMN public.pv_forecast_settings.recalibration_locked IS 'Blocks PV performance ratio auto-recalibration until the new GTI-based model has accumulated enough baseline data.';
COMMENT ON COLUMN public.pv_forecast_settings.recalibration_locked_until IS 'Timestamp after which GTI-based recalibration may automatically unlock.';
COMMENT ON COLUMN public.pv_forecast_settings.recalibration_baseline_started_at IS 'Timestamp when the GTI-based baseline period started.';