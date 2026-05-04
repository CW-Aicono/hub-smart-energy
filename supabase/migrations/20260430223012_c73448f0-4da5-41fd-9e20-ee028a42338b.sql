-- 1) Erweiterte Cheap-Charging-Konfiguration auf Gruppenebene
UPDATE public.charge_point_groups
SET energy_settings = jsonb_set(
  COALESCE(energy_settings, '{}'::jsonb),
  '{cheap_charging}',
  jsonb_build_object(
    'enabled', COALESCE((energy_settings->>'cheap_charging_mode')::boolean, false),
    'max_price_eur_mwh', 60,
    'limit_kw', 11,
    'use_fallback_window', true,
    'fallback_time_from', COALESCE(energy_settings->'cheap_charging_window'->>'time_from', '22:00'),
    'fallback_time_to', COALESCE(energy_settings->'cheap_charging_window'->>'time_to', '06:00')
  ),
  true
)
WHERE NOT (energy_settings ? 'cheap_charging')
   OR (energy_settings->'cheap_charging') IS NULL;

-- 2) Pro-CP Override für Cheap-Charging
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS cheap_charging_schedule jsonb
  DEFAULT jsonb_build_object(
    'enabled', false,
    'max_price_eur_mwh', 60,
    'limit_kw', 11,
    'use_fallback_window', true,
    'fallback_time_from', '22:00',
    'fallback_time_to', '06:00'
  );

COMMENT ON COLUMN public.charge_points.cheap_charging_schedule IS
  'Optional CP-level override for cheap-charging. When enabled=true overrides the group setting. Mirrors group energy_settings.cheap_charging shape.';