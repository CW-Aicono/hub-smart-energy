UPDATE public.wallbox_modbus_templates SET
  read_map = '[
    {"address":402,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"power_configuration_kw"},
    {"address":404,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"phases_configured"},
    {"address":1000,"function_code":4,"data_type":"uint16","poll_group":"fast","target_field":"vendor_status"},
    {"address":1001,"function_code":4,"data_type":"uint16","poll_group":"fast","target_field":"charging_state"},
    {"address":1002,"function_code":4,"data_type":"uint16","poll_group":"fast","target_field":"equipment_state"},
    {"address":1004,"function_code":4,"data_type":"uint16","poll_group":"fast","target_field":"cable_state"},
    {"address":1006,"function_code":4,"data_type":"uint32","byte_order":"big","poll_group":"slow","target_field":"fault_code"},
    {"address":1008,"function_code":4,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l1_a"},
    {"address":1010,"function_code":4,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l2_a"},
    {"address":1012,"function_code":4,"data_type":"uint16","poll_group":"fast","scale":0.001,"target_field":"current_l3_a"},
    {"address":1014,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"voltage_l1_v"},
    {"address":1016,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"voltage_l2_v"},
    {"address":1018,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"voltage_l3_v"},
    {"address":1020,"function_code":4,"data_type":"uint32","byte_order":"big","poll_group":"fast","target_field":"power_total_w"},
    {"address":1036,"function_code":4,"data_type":"uint32","byte_order":"big","poll_group":"slow","scale":0.1,"target_field":"energy_total_kwh"},
    {"address":1100,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"session_max_current_a"},
    {"address":1102,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"evse_min_current_a"},
    {"address":1104,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"evse_max_current_a"},
    {"address":1106,"function_code":4,"data_type":"uint16","poll_group":"slow","target_field":"cable_max_current_a"},
    {"address":1502,"function_code":4,"data_type":"uint32","byte_order":"big","poll_group":"slow","target_field":"session_energy_wh"},
    {"address":1508,"function_code":4,"data_type":"uint32","byte_order":"big","poll_group":"slow","target_field":"session_duration_s"}
  ]'::jsonb,
  write_map = '{
    "set_current":{"address":5004,"function_code":6,"data_type":"uint16","unit":"A","min":0,"max":32},
    "failsafe_current":{"address":2000,"function_code":6,"data_type":"uint16","unit":"A","value":6},
    "failsafe_timeout":{"address":2002,"function_code":6,"data_type":"uint16","unit":"s","value":20},
    "alive":{"address":6000,"function_code":6,"data_type":"uint16","value":1,"period_ms":10000}
  }'::jsonb,
  notes = 'Quelle: Vestel EVC Modbus TCP/IP Specification v1.15 (28.07.2025, modellunabhängig). Port 502, Unit-ID 255, nur ein Master. Nur-Lese-Register sind Input-Register (Funktion 0x04), R/W-Register Holding-Register (0x03/0x06). Nach Verbindungsaufbau sofort 2000/2002/5004 schreiben; Alive (6000)=1 alle halbe Failsafe-Zeit (min. 3 s). Ladestrom <6 A außerhalb einer Sitzung wird von der Station auf 6 A angehoben. Phasenumschaltung 405 nur, wenn 404=3-phasig; setzt sich bei Modbus-Trennung zurück (nicht genutzt). Connector 2 = Adresse +2000. Fehlercode 1006 ist Bitfeld (Bit 0–31). Failsafe 6 A / 20 s sind AICONO-Voreinstellung.',
  version = version + 1,
  updated_at = now()
WHERE vendor = 'Vestel' AND model = 'EVC10 / AC Gemini Dual';