-- Phase 4: DLM (Dynamic Load Management) — Standort/Gruppen-Limits

-- 1) Default-Erweiterung von energy_settings für neue Gruppen mit DLM-Block
ALTER TABLE public.charge_point_groups
  ALTER COLUMN energy_settings SET DEFAULT '{
    "power_limit_kw": null,
    "pv_surplus_only": false,
    "cheap_charging": false,
    "energy_management_enabled": false,
    "power_limit_schedule": {
      "enabled": false,
      "mode": "allday",
      "time_from": "18:00",
      "time_to": "07:00",
      "limit_type": "kw",
      "limit_kw": null
    },
    "cheap_charging_window": {
      "time_from": "22:00",
      "time_to": "06:00"
    },
    "dlm": {
      "enabled": false,
      "limit_kw": null,
      "reference_meter_id": null
    }
  }'::jsonb;

-- 2) Backfill DLM-Block für bestehende Gruppen (idempotent)
UPDATE public.charge_point_groups
  SET energy_settings = energy_settings || jsonb_build_object(
    'dlm', jsonb_build_object('enabled', false, 'limit_kw', null, 'reference_meter_id', null)
  )
  WHERE NOT (energy_settings ? 'dlm');

-- 3) Hilfsfunktion: liefert PK des Hauptzählers eines Standorts (für DLM-Hardlimit)
CREATE OR REPLACE FUNCTION public.get_location_main_meter(p_location_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.meters
  WHERE location_id = p_location_id
    AND is_main_meter = true
  ORDER BY created_at ASC
  LIMIT 1
$$;