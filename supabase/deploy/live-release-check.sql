-- Read-only release assertions. No tenant data is created or changed.
DO $release_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='setup_status' AND column_default='''setup''::text') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: neue Tenants starten nicht in Einrichtung';
  END IF;
  IF to_regprocedure('public.complete_tenant_setup(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Uebergabe-Funktion fehlt';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.complete_tenant_setup(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.complete_tenant_setup(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Uebergabe-Rechte fehlerhaft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_enforce_charger_template' AND tgrelid='public.charge_points'::regclass AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Ladestations-Vorlagenschutz fehlt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.charger_models WHERE vendor='Vestel' AND model='AC Gemini Dual' AND jsonb_array_length(variants)=6 AND modbus_template_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Gemini-Vorlage fehlt';
  END IF;
  IF (SELECT count(*) FROM public.charger_models WHERE vendor='ELMI Power' AND model IN ('All-in-One 180','All-in-One 360') AND variants @> '[{"connector_types":["CCS"],"cable_attached":true,"supports_connector_lock":false}]'::jsonb) <> 2 THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: ELMI-CCS-Vorlagen fehlen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallbox_modbus_templates WHERE vendor='Vestel' AND model='EVC10 / AC Gemini Dual' AND is_active AND bridge_mode='dlm_only' AND write_map->'set_current'->>'address'='5004' AND write_map->'alive'->>'address'='6000') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Vestel-Modbus-Register fehlen';
  END IF;
END
$release_check$;