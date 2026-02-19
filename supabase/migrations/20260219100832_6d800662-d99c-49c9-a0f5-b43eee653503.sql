
-- Add power_limit_schedule to charge_points (individual charge point power limit config)
ALTER TABLE public.charge_points
ADD COLUMN IF NOT EXISTS power_limit_schedule jsonb DEFAULT '{
  "enabled": false,
  "mode": "allday",
  "time_from": "18:00",
  "time_to": "07:00",
  "limit_type": "kw",
  "limit_kw": null
}'::jsonb;

-- Update charge_point_groups energy_settings default to include the same structure
-- (already stored in energy_settings JSONB, but we extend the default for new groups)
ALTER TABLE public.charge_point_groups
ALTER COLUMN energy_settings SET DEFAULT '{
  "power_limit_kw": null,
  "cheap_charging_mode": false,
  "pv_surplus_charging": false,
  "scheduled_availability": false,
  "dynamic_load_management": false,
  "power_limit_schedule": {
    "enabled": false,
    "mode": "allday",
    "time_from": "18:00",
    "time_to": "07:00",
    "limit_type": "kw",
    "limit_kw": null
  }
}'::jsonb;
