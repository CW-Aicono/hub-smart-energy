-- ELMI All-in-One: Speichersteuerung über Loxone Miniserver, PV-Überschuss-Priorität
ALTER TABLE public.energy_storages
  ADD COLUMN IF NOT EXISTS device_template text,
  ADD COLUMN IF NOT EXISTS charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'monitor_only',
  ADD COLUMN IF NOT EXISTS allow_self_discharge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_grid_discharge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_setpoint_kw numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS setpoint_integration_id uuid REFERENCES public.location_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setpoint_control_uuid text,
  ADD COLUMN IF NOT EXISTS last_setpoint_kw numeric,
  ADD COLUMN IF NOT EXISTS last_setpoint_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_setpoint_error text;

COMMENT ON COLUMN public.energy_storages.allow_grid_discharge IS 'Prepared for peak shaving; forced to false by trigger until grid operator approval is implemented.';

CREATE OR REPLACE FUNCTION public.energy_storages_lock_grid_discharge()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.allow_grid_discharge := false;
  IF NEW.control_mode NOT IN ('monitor_only','pv_surplus') THEN
    NEW.control_mode := 'monitor_only';
  END IF;
  IF NEW.min_setpoint_kw IS NULL OR NEW.min_setpoint_kw < 0 THEN
    NEW.min_setpoint_kw := 5;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_energy_storages_lock_grid_discharge ON public.energy_storages;
CREATE TRIGGER trg_energy_storages_lock_grid_discharge
  BEFORE INSERT OR UPDATE ON public.energy_storages
  FOR EACH ROW EXECUTE FUNCTION public.energy_storages_lock_grid_discharge();

ALTER TABLE public.solar_charging_config
  ADD COLUMN IF NOT EXISTS storage_id uuid REFERENCES public.energy_storages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_priority text NOT NULL DEFAULT 'ev_first';

-- Gerätekatalog
INSERT INTO public.charger_models (vendor, model, protocol, charging_type, power_kw, notes, is_active)
SELECT 'ELMI Power', v.model, 'ocpp1.6', 'DC', v.kw, 'All-in-One mit Batteriespeicher; Speicher via Modbus TCP (Loxone Miniserver)', true
FROM (VALUES ('All-in-One 180', 180::numeric), ('All-in-One 360', 360::numeric)) AS v(model, kw)
WHERE NOT EXISTS (SELECT 1 FROM public.charger_models c WHERE c.vendor = 'ELMI Power' AND c.model = v.model);

-- Modbus-Registersatz (Big-Endian, Protokoll v1.4)
INSERT INTO public.wallbox_modbus_templates (vendor, model, default_port, default_unit_id, read_map, write_map, status_map, notes, is_active)
VALUES ('ELMI Power', 'All-in-One', 502, 1,
 '[
  {"address":1000,"function_code":3,"data_type":"uint32","scale":0.1,"target_field":"stack_voltage_v","poll_group":"slow"},
  {"address":1070,"function_code":3,"data_type":"uint32","scale":0.1,"target_field":"grid_import_w","poll_group":"fast"},
  {"address":1072,"function_code":3,"data_type":"int32","scale":0.1,"target_field":"grid_export_w","poll_group":"fast"},
  {"address":1074,"function_code":3,"data_type":"uint32","scale":0.1,"target_field":"available_charge_w","poll_group":"slow"},
  {"address":1076,"function_code":3,"data_type":"uint32","scale":0.1,"target_field":"available_discharge_w","poll_group":"slow"},
  {"address":1078,"function_code":3,"data_type":"int32","scale":0.1,"target_field":"setpoint_ack_w","poll_group":"fast"},
  {"address":1300,"function_code":3,"data_type":"uint32","scale":1,"target_field":"cp_a_voltage_v","poll_group":"fast"},
  {"address":1310,"function_code":3,"data_type":"uint32","scale":1,"target_field":"cp_a_energy_wh","poll_group":"slow"},
  {"address":1350,"function_code":3,"data_type":"uint32","scale":1,"target_field":"cp_b_voltage_v","poll_group":"fast"},
  {"address":1360,"function_code":3,"data_type":"uint32","scale":1,"target_field":"cp_b_energy_wh","poll_group":"slow"}
 ]'::jsonb,
 '{"set_power":{"address":1200,"function_code":16,"data_type":"int32","scale":0.1,"unit":"W"},
   "heartbeat":{"address":1204,"function_code":16,"data_type":"uint32","interval_s":10}}'::jsonb,
 '{"0":"Unknown","1":"Available","2":"Connected","3":"Charging","4":"Finishing","5":"Faulted","6":"Unavailable","7":"Reserved"}'::jsonb,
 'ELMI AiO Modbus TCP v1.4. Heartbeat 1204 mind. alle 30 s, sonst Offline-Strategie. Sollwert 1200: + laden / - entladen, Mindestleistung 5 kW. Netzentladung gesperrt.',
 true)
ON CONFLICT (vendor, model) DO NOTHING;