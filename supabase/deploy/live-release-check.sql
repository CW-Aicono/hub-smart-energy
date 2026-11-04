-- Read-only release assertions. No tenant data is created or changed.
DO $release_check$
BEGIN
  IF to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)') IS NULL
     OR to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)') IS NULL
     OR to_regprocedure('public.finalize_license_sale_options(uuid,text,text,integer,text,numeric,date,text,uuid,numeric,date,date,text,text)') IS NULL
     OR to_regprocedure('public.effective_tenant_modules(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Paketkorrekturen oder effektive Freischaltungen fehlen';
  END IF;
  IF public.license_period_end('2026-11-03'::date,'yearly') IS DISTINCT FROM '2026-12-31'::date
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.license_sales'::regclass AND conname='license_sales_cadence_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%yearly%')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='license_sales' AND column_name='discount_after') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Jahresabrechnung oder Rabattablauf fehlen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)') AND prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)') AND prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%') THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Paketkorrektur-Sicherheitsregeln fehlen';
  END IF;
  IF to_regclass('public.license_sale_corrections') IS NULL
     OR NOT has_table_privilege('authenticated','public.license_sale_corrections','SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.license_sale_corrections'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Live-Release unvollstaendig: Korrekturprotokoll oder Zugriffsrechte fehlen';
  END IF;
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