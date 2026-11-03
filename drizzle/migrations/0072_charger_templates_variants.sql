ALTER TABLE public.charger_models ADD COLUMN IF NOT EXISTS variants jsonb;
ALTER TABLE public.charger_models ADD COLUMN IF NOT EXISTS dlm_notes text;
ALTER TABLE public.charger_models ADD COLUMN IF NOT EXISTS modbus_template_id uuid REFERENCES public.wallbox_modbus_templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.charger_models.variants IS 'Template variants: [{key,label,charging_type,connector_types[],connector_count,max_power_kw,cable_attached,supports_connector_lock,phases[],min_current_a,max_current_a}]; null field = user decides';

ALTER TABLE public.charge_points ADD COLUMN IF NOT EXISTS charger_model_id uuid REFERENCES public.charger_models(id) ON DELETE SET NULL;
ALTER TABLE public.charge_points ADD COLUMN IF NOT EXISTS charger_variant text;
ALTER TABLE public.charge_points ADD COLUMN IF NOT EXISTS cable_attached boolean;
ALTER TABLE public.charge_points ADD COLUMN IF NOT EXISTS supports_connector_lock boolean;

-- Vorlage erzwingt festgelegte Werte (auch bei API/Import)
CREATE OR REPLACE FUNCTION public.enforce_charger_template()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v jsonb; allowed text[]; given text[];
BEGIN
  IF NEW.charger_model_id IS NULL OR NEW.charger_variant IS NULL THEN RETURN NEW; END IF;
  SELECT e INTO v FROM public.charger_models m, jsonb_array_elements(COALESCE(m.variants,'[]'::jsonb)) e
   WHERE m.id = NEW.charger_model_id AND e->>'key' = NEW.charger_variant;
  IF v IS NULL THEN RAISE EXCEPTION 'Unbekannte Vorlagen-Variante %', NEW.charger_variant; END IF;
  IF v ? 'connector_types' AND jsonb_typeof(v->'connector_types') = 'array' THEN
    SELECT array_agg(x) INTO allowed FROM jsonb_array_elements_text(v->'connector_types') x;
    given := string_to_array(COALESCE(NEW.connector_type,''), ',');
    IF NOT (given <@ allowed) OR cardinality(given) = 0 THEN
      NEW.connector_type := array_to_string(allowed, ',');
    END IF;
  END IF;
  IF jsonb_typeof(v->'connector_count') = 'number' THEN NEW.connector_count := (v->>'connector_count')::int; END IF;
  IF jsonb_typeof(v->'max_power_kw') = 'number' AND (NEW.max_power_kw IS NULL OR NEW.max_power_kw > (v->>'max_power_kw')::numeric) THEN
    NEW.max_power_kw := (v->>'max_power_kw')::numeric;
  END IF;
  IF jsonb_typeof(v->'cable_attached') = 'boolean' THEN NEW.cable_attached := (v->>'cable_attached')::boolean; END IF;
  IF jsonb_typeof(v->'supports_connector_lock') = 'boolean' THEN NEW.supports_connector_lock := (v->>'supports_connector_lock')::boolean; END IF;
  IF NEW.cable_attached IS TRUE THEN NEW.supports_connector_lock := false; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_charger_template ON public.charge_points;
CREATE TRIGGER trg_enforce_charger_template BEFORE INSERT OR UPDATE ON public.charge_points
  FOR EACH ROW EXECUTE FUNCTION public.enforce_charger_template();

-- Modbus-Vorlage Vestel EVC10 / Gemini (Registerliste folgt)
INSERT INTO public.wallbox_modbus_templates (vendor, model, default_unit_id, default_port, notes, is_active)
SELECT 'Vestel', 'EVC10 / AC Gemini Dual', 255, 502,
 'Modbus TCP Slave, Port 502, Unit-ID 255. Nur eine Master-Verbindung gleichzeitig. Master setzt nach Verbindungsaufbau sofort Failsafe-Strom, Failsafe-Timeout und Ladestrom und schreibt das Alive-Register alle halbe Failsafe-Zeit. REGISTERLISTE FEHLT – write_map erst nach Vestel-Modbus-Dokument eintragen.', false
WHERE NOT EXISTS (SELECT 1 FROM public.wallbox_modbus_templates WHERE vendor='Vestel' AND model='EVC10 / AC Gemini Dual');

INSERT INTO public.charger_models (vendor, model, protocol, charging_type, power_kw, is_active, notes)
SELECT 'Vestel', 'AC Gemini Dual', 'ocpp1.6', 'AC', 44, true, 'Datenblatt 05/2024; 2 Ladepunkte, 10–32 A, 1-/3-phasig'
WHERE NOT EXISTS (SELECT 1 FROM public.charger_models WHERE vendor='Vestel' AND model='AC Gemini Dual');

UPDATE public.charger_models SET
  modbus_template_id = (SELECT id FROM public.wallbox_modbus_templates WHERE vendor='Vestel' AND model='EVC10 / AC Gemini Dual' LIMIT 1),
  dlm_notes = 'Lastmanagement über AICONO via Modbus TCP mit beliebigem Zähler/Modbus-Server als Messquelle. Vestel Power Optimizer funktioniert nur mit Vestel-Zählern (KLEFR). Registerliste fehlt noch.',
  variants = '[
   {"key":"ac15_socket","label":"AC15 – 2 × 7,4 kW, Typ-2-Steckdose","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":14.8,"cable_attached":false,"supports_connector_lock":true,"phases":[1],"min_current_a":10,"max_current_a":32},
   {"key":"ac15_cable","label":"AC15 – 2 × 7,4 kW, Kabel 5 m / 7 m","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":14.8,"cable_attached":true,"supports_connector_lock":false,"phases":[1],"min_current_a":10,"max_current_a":32},
   {"key":"ac22_socket","label":"AC22 – 1 × 22 / 2 × 11 kW, Typ-2-Steckdose","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":22,"cable_attached":false,"supports_connector_lock":true,"phases":[3],"min_current_a":10,"max_current_a":32},
   {"key":"ac22_cable","label":"AC22 – 1 × 22 / 2 × 11 kW, Kabel 5 m / 7 m","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":22,"cable_attached":true,"supports_connector_lock":false,"phases":[3],"min_current_a":10,"max_current_a":32},
   {"key":"ac44_socket","label":"AC44 – 2 × 22 kW, Typ-2-Steckdose","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":44,"cable_attached":false,"supports_connector_lock":true,"phases":[3],"min_current_a":10,"max_current_a":32},
   {"key":"ac44_cable","label":"AC44 – 2 × 22 kW, Kabel 5 m / 7 m","charging_type":"AC","connector_types":["Type2"],"connector_count":2,"max_power_kw":44,"cable_attached":true,"supports_connector_lock":false,"phases":[3],"min_current_a":10,"max_current_a":32}
  ]'::jsonb
WHERE vendor='Vestel' AND model='AC Gemini Dual';

UPDATE public.charger_models SET variants = jsonb_build_array(jsonb_build_object(
  'key','standard','label','DC, CCS, fest angeschlagenes Kabel','charging_type','DC',
  'connector_types', jsonb_build_array('CCS'),'max_power_kw', power_kw,
  'cable_attached', true,'supports_connector_lock', false))
WHERE vendor='ELMI Power' AND model IN ('All-in-One 180','All-in-One 360') AND variants IS NULL;