
-- 1. Enum für Geräteklasse
DO $$ BEGIN
  CREATE TYPE public.device_class AS ENUM (
    'meter', 'gateway', 'power_supply', 'network_switch', 'router',
    'addon_module', 'cable', 'accessory', 'misc'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. device_catalog erweitern
ALTER TABLE public.device_catalog
  ADD COLUMN IF NOT EXISTS geraete_klasse public.device_class NOT NULL DEFAULT 'meter',
  ADD COLUMN IF NOT EXISTS benoetigt_klassen text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kompatible_klassen text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tech_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS einheit text NOT NULL DEFAULT 'Stück';

CREATE INDEX IF NOT EXISTS idx_device_catalog_klasse ON public.device_catalog(geraete_klasse);

-- 3. Tabelle device_compatibility
CREATE TABLE IF NOT EXISTS public.device_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_device_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE CASCADE,
  target_device_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('requires','recommends','alternative')),
  auto_quantity_formula text NOT NULL DEFAULT '1',
  prio integer NOT NULL DEFAULT 100,
  notiz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_device_id, target_device_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_device_compat_source ON public.device_compatibility(source_device_id);
CREATE INDEX IF NOT EXISTS idx_device_compat_target ON public.device_compatibility(target_device_id);

ALTER TABLE public.device_compatibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_compat_read_authenticated" ON public.device_compatibility;
CREATE POLICY "device_compat_read_authenticated"
  ON public.device_compatibility FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "device_compat_write_super_admin" ON public.device_compatibility;
CREATE POLICY "device_compat_write_super_admin"
  ON public.device_compatibility FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_device_compat_updated_at ON public.device_compatibility;
CREATE TRIGGER trg_device_compat_updated_at
  BEFORE UPDATE ON public.device_compatibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. sales_recommended_devices erweitern
ALTER TABLE public.sales_recommended_devices
  ADD COLUMN IF NOT EXISTS parent_recommendation_id uuid REFERENCES public.sales_recommended_devices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS geraete_klasse text;

CREATE INDEX IF NOT EXISTS idx_sales_rec_parent
  ON public.sales_recommended_devices(parent_recommendation_id);
CREATE INDEX IF NOT EXISTS idx_sales_rec_klasse
  ON public.sales_recommended_devices(geraete_klasse);

-- 5. Seed-Daten (idempotent über hersteller+modell)
INSERT INTO public.device_catalog
  (hersteller, modell, ek_preis, vk_preis, installations_pauschale, geraete_klasse, benoetigt_klassen, kompatible_klassen, tech_specs, einheit, beschreibung)
VALUES
  ('Loxone','Miniserver Go',399,549,180,'gateway','{power_supply}','{addon_module,network_switch}','{"voltage":"USB-C","din_rail":false,"wireless":true}','Stück','Kompakter Wireless-Miniserver'),
  ('Loxone','Miniserver',499,699,220,'gateway','{power_supply}','{addon_module,network_switch}','{"voltage":"24V","din_rail":true}','Stück','DIN-Hutschienen Miniserver'),
  ('Loxone','Modbus Extension',279,389,90,'addon_module','{}','{gateway}','{"din_rail":true,"protocol":"Modbus"}','Stück','Modbus-RTU Erweiterung'),
  ('Loxone','Tree Extension',229,319,80,'addon_module','{}','{gateway}','{"din_rail":true,"protocol":"Tree"}','Stück','Tree-Bus Erweiterung'),
  ('Loxone','Energiezähler 1-phasig',129,179,120,'meter','{}','{gateway}','{"phasen":1,"max_strom":63}','Stück','1-phasiger Energiezähler'),
  ('Loxone','Energiezähler 3-phasig',189,259,140,'meter','{}','{gateway}','{"phasen":3,"max_strom":63}','Stück','3-phasiger Energiezähler'),
  ('MeanWell','Hutschienen-Netzteil 24V/2.5A',39,69,40,'power_supply','{}','{gateway,addon_module}','{"voltage":"24V","current_a":2.5,"din_rail":true}','Stück','24V DC DIN-Netzteil'),
  ('Anker','USB-C Netzteil 20W',12,24,0,'power_supply','{}','{gateway}','{"voltage":"USB-C","watt":20}','Stück','USB-C Steckernetzteil'),
  ('TP-Link','TL-SG108 8-Port Switch',24,49,30,'network_switch','{power_supply}','{gateway,router}','{"ports":8,"poe":false}','Stück','8-Port Gigabit Switch'),
  ('AVM','FritzBox 7530',149,219,60,'router','{power_supply}','{network_switch}','{"wifi":"WiFi6","ports":4}','Stück','DSL-Router mit WLAN'),
  ('Generic','Patchkabel Cat6 1m',2,5,0,'cable','{}','{network_switch,router,gateway}','{"length_m":1,"cat":6}','Stück','Netzwerk-Patchkabel 1m'),
  ('Generic','Patchkabel Cat6 3m',3,7,0,'cable','{}','{network_switch,router,gateway}','{"length_m":3,"cat":6}','Stück','Netzwerk-Patchkabel 3m'),
  ('Generic','Patchkabel Cat6 5m',4,9,0,'cable','{}','{network_switch,router,gateway}','{"length_m":5,"cat":6}','Stück','Netzwerk-Patchkabel 5m')
ON CONFLICT DO NOTHING;

-- 6. Kompatibilitäts-Regeln
DO $$
DECLARE
  v_miniserver uuid;
  v_miniserver_go uuid;
  v_psu_24v uuid;
  v_psu_usbc uuid;
  v_modbus uuid;
  v_tree uuid;
  v_switch uuid;
  v_cable3m uuid;
BEGIN
  SELECT id INTO v_miniserver FROM public.device_catalog WHERE hersteller='Loxone' AND modell='Miniserver' LIMIT 1;
  SELECT id INTO v_miniserver_go FROM public.device_catalog WHERE hersteller='Loxone' AND modell='Miniserver Go' LIMIT 1;
  SELECT id INTO v_psu_24v FROM public.device_catalog WHERE modell='Hutschienen-Netzteil 24V/2.5A' LIMIT 1;
  SELECT id INTO v_psu_usbc FROM public.device_catalog WHERE modell='USB-C Netzteil 20W' LIMIT 1;
  SELECT id INTO v_modbus FROM public.device_catalog WHERE modell='Modbus Extension' LIMIT 1;
  SELECT id INTO v_tree FROM public.device_catalog WHERE modell='Tree Extension' LIMIT 1;
  SELECT id INTO v_switch FROM public.device_catalog WHERE modell='TL-SG108 8-Port Switch' LIMIT 1;
  SELECT id INTO v_cable3m FROM public.device_catalog WHERE modell='Patchkabel Cat6 3m' LIMIT 1;

  -- Miniserver (DIN) braucht 24V-Netzteil, empfiehlt Modbus + Switch + Kabel
  IF v_miniserver IS NOT NULL AND v_psu_24v IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver, v_psu_24v, 'requires', '1', 10, 'Miniserver benötigt 24V DC Versorgung')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_miniserver IS NOT NULL AND v_modbus IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver, v_modbus, 'recommends', '1', 50, 'Modbus-Extension für Energiezähler')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_miniserver IS NOT NULL AND v_tree IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver, v_tree, 'recommends', '1', 60, 'Tree-Extension für Sensorik')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_miniserver IS NOT NULL AND v_switch IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver, v_switch, 'recommends', '1', 70, 'Switch für mehrere IP-Geräte')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_miniserver IS NOT NULL AND v_cable3m IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver, v_cable3m, 'recommends', '2', 80, 'Patchkabel zur Verbindung')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Miniserver Go braucht USB-C Netzteil, empfiehlt Switch
  IF v_miniserver_go IS NOT NULL AND v_psu_usbc IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver_go, v_psu_usbc, 'requires', '1', 10, 'Miniserver Go benötigt USB-C Versorgung')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_miniserver_go IS NOT NULL AND v_switch IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_miniserver_go, v_switch, 'recommends', '1', 70, 'Switch bei mehreren IP-Geräten')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Switch braucht Netzteil
  IF v_switch IS NOT NULL AND v_psu_usbc IS NOT NULL THEN
    INSERT INTO public.device_compatibility (source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz)
    VALUES (v_switch, v_psu_usbc, 'requires', '1', 10, 'Switch benötigt Steckernetzteil')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
