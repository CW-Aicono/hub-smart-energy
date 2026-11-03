ALTER TABLE public.wallbox_modbus_templates ADD COLUMN IF NOT EXISTS bridge_mode text NOT NULL DEFAULT 'emulate_ocpp';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallbox_modbus_templates_bridge_mode_check') THEN
    ALTER TABLE public.wallbox_modbus_templates ADD CONSTRAINT wallbox_modbus_templates_bridge_mode_check CHECK (bridge_mode IN ('emulate_ocpp','dlm_only'));
  END IF;
END $$;
COMMENT ON COLUMN public.wallbox_modbus_templates.bridge_mode IS 'emulate_ocpp: Gateway spiegelt die Wallbox als OCPP-Station; dlm_only: Station spricht OCPP selbst, Modbus nur für Lastmanagement';

UPDATE public.wallbox_modbus_templates SET
  bridge_mode = 'dlm_only',
  is_active = true,
  read_map = '[
    {"address":1000,"function_code":3,"data_type":"uint16","poll_group":"fast","target_field":"vendor_status"},
    {"address":1004,"function_code":3,"data_type":"uint16","poll_group":"fast","target_field":"cable_state"},
    {"address":1006,"function_code":3,"data_type":"uint32","byte_order":"big","poll_group":"slow","target_field":"fault_code"},
    {"address":1008,"function_code":3,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l1_a"},
    {"address":1010,"function_code":3,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l2_a"},
    {"address":1012,"function_code":3,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l3_a"},
    {"address":1020,"function_code":3,"data_type":"uint32","byte_order":"big","poll_group":"fast","target_field":"power_total_w"},
    {"address":1036,"function_code":3,"data_type":"uint32","byte_order":"big","poll_group":"slow","scale":0.1,"target_field":"energy_total_kwh"},
    {"address":1100,"function_code":3,"data_type":"uint16","poll_group":"slow","target_field":"session_max_current_a"},
    {"address":1102,"function_code":3,"data_type":"uint16","poll_group":"slow","target_field":"evse_min_current_a"},
    {"address":1104,"function_code":3,"data_type":"uint16","poll_group":"slow","target_field":"evse_max_current_a"},
    {"address":1106,"function_code":3,"data_type":"uint16","poll_group":"slow","target_field":"cable_max_current_a"}
  ]'::jsonb,
  write_map = '{
    "set_current":{"address":5004,"function_code":6,"data_type":"uint16","unit":"A","min":0,"max":32},
    "failsafe_current":{"address":2000,"function_code":6,"data_type":"uint16","unit":"A","value":6},
    "failsafe_timeout":{"address":2002,"function_code":6,"data_type":"uint16","unit":"s","value":20},
    "alive":{"address":6000,"function_code":6,"data_type":"uint16","value":1,"period_ms":10000}
  }'::jsonb,
  status_map = '{"0":"Available","1":"Preparing","2":"Charging","3":"SuspendedEVSE","4":"SuspendedEV","5":"Finishing","6":"Reserved","7":"Unavailable","8":"Faulted"}'::jsonb,
  notes = 'Quelle: Vestel EVC04 Modbus TCP Specification v1.8 (gleiche Parameter laut EVC10-Installationsanleitung). Port 502, Unit-ID 255, nur ein Master. Nach Verbindungsaufbau sofort Failsafe-Strom (2000), Failsafe-Timeout (2002) und Ladestrom (5004) schreiben; Alive (6000) = 1 alle halbe Failsafe-Zeit (min. 3 s). Station spricht OCPP selbst – Modbus nur für Lastmanagement. Failsafe 6 A / 20 s sind AICONO-Voreinstellung.',
  version = version + 1,
  updated_at = now()
WHERE vendor = 'Vestel' AND model = 'EVC10 / AC Gemini Dual';

UPDATE public.charger_models SET dlm_notes = 'Lastmanagement über AICONO via Modbus TCP (Port 502, Unit-ID 255) mit beliebigem Zähler/Modbus-Server als Messquelle; bei Verbindungsverlust gilt der Failsafe-Strom. Vestel Power Optimizer funktioniert nur mit Vestel-Zählern (KLEFR).'
WHERE vendor = 'Vestel' AND model = 'AC Gemini Dual';