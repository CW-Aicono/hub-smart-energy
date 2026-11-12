-- Safe on partial schemas; temporary function leaves no persistent DB object.
CREATE OR REPLACE FUNCTION pg_temp.charger_templates_ready()
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ready boolean;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND (
      (table_name='charge_points' AND column_name IN ('charger_model_id','charger_variant','cable_attached','supports_connector_lock'))
      OR (table_name='charger_models' AND column_name IN ('variants','dlm_notes','modbus_template_id'))
      OR (table_name='wallbox_modbus_templates' AND column_name='bridge_mode'))) <> 8 THEN
    RETURN false;
  END IF;
  IF to_regprocedure('public.enforce_charger_template()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.charge_points')
      AND tgname='trg_enforce_charger_template' AND tgenabled IN ('O','A')
      AND tgfoid=to_regprocedure('public.enforce_charger_template()')
      AND (tgtype::integer & 23)=23
  ) THEN RETURN false; END IF;
  EXECUTE $check$
    SELECT
      (SELECT count(*) FROM public.charger_models WHERE vendor='ELMI Power'
        AND model IN ('All-in-One 180','All-in-One 360') AND is_active
        AND variants @> '[{"key":"standard","connector_types":["CCS"],"cable_attached":true,"supports_connector_lock":false}]'::jsonb) = 2
      AND EXISTS (SELECT 1 FROM public.charger_models m
        JOIN public.wallbox_modbus_templates w ON w.id=m.modbus_template_id
        WHERE m.vendor='Vestel' AND m.model='AC Gemini Dual' AND m.is_active
          AND CASE WHEN jsonb_typeof(m.variants)='array' THEN jsonb_array_length(m.variants)=6 ELSE false END
          AND w.vendor='Vestel' AND w.model='EVC10 / AC Gemini Dual'
          AND w.is_active AND w.bridge_mode='dlm_only'
          AND w.read_map @> '[{"address":1000,"function_code":4},{"address":1502,"function_code":4},{"address":1508,"function_code":4}]'::jsonb
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(w.read_map)='array' THEN w.read_map ELSE '[]'::jsonb END
          ) r WHERE r->>'function_code' IS DISTINCT FROM '4')
          AND w.write_map @> '{"set_current":{"address":5004,"function_code":6},"failsafe_current":{"address":2000,"value":6},"failsafe_timeout":{"address":2002,"value":20},"alive":{"address":6000,"period_ms":10000}}'::jsonb)
  $check$ INTO ready;
  RETURN coalesce(ready,false);
END $$;
SELECT pg_temp.charger_templates_ready() AS charger_templates_ready;