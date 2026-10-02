INSERT INTO public.charger_models (vendor, model, protocol, power_kw, charging_type, is_active, notes)
VALUES ('Mennekes', 'Amedio', 'ocpp1.6', 22, 'AC', true, 'Mennekes Amedio – Public AC-Ladesäule, OCPP 1.6 (JSON), bis 22 kW')
ON CONFLICT DO NOTHING;