CREATE TABLE IF NOT EXISTS public.pricing_packages (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  uvp numeric NOT NULL DEFAULT 0,
  ek numeric NOT NULL DEFAULT 0,
  requires_package text,
  requires_any_other boolean NOT NULL DEFAULT false,
  always_active boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pricing_package_modules (
  package_code text NOT NULL REFERENCES public.pricing_packages(code) ON DELETE CASCADE,
  module_code text NOT NULL,
  PRIMARY KEY (package_code, module_code)
);
CREATE TABLE IF NOT EXISTS public.pricing_unit_prices (
  code text PRIMARY KEY,
  name text NOT NULL,
  uvp numeric NOT NULL DEFAULT 0,
  ek numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.module_catalog_flags (
  module_code text PRIMARY KEY,
  visibility text NOT NULL DEFAULT 'sellable' CHECK (visibility IN ('sellable','hidden','on_request'))
);
CREATE TABLE IF NOT EXISTS public.tenant_package_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_code text NOT NULL REFERENCES public.pricing_packages(code),
  booked_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  booked_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_package_active ON public.tenant_package_bookings(tenant_id, package_code) WHERE cancelled_at IS NULL;

GRANT SELECT ON public.pricing_packages, public.pricing_package_modules, public.pricing_unit_prices, public.module_catalog_flags, public.tenant_package_bookings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_packages, public.pricing_package_modules, public.pricing_unit_prices, public.module_catalog_flags TO authenticated;
GRANT ALL ON public.pricing_packages, public.pricing_package_modules, public.pricing_unit_prices, public.module_catalog_flags, public.tenant_package_bookings TO service_role;

ALTER TABLE public.pricing_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_package_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_unit_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_catalog_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_package_bookings ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pricing_packages','pricing_package_modules','pricing_unit_prices','module_catalog_flags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "catalog read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "catalog read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "catalog write commercial" ON public.%I', t);
    EXECUTE format('CREATE POLICY "catalog write commercial" ON public.%I FOR ALL TO authenticated USING (public.can_portal_write(auth.uid(), ''commercial'')) WITH CHECK (public.can_portal_write(auth.uid(), ''commercial''))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "bookings read" ON public.tenant_package_bookings;
CREATE POLICY "bookings read" ON public.tenant_package_bookings FOR SELECT TO authenticated USING (
  public.can_portal_read(auth.uid(), 'commercial')
  OR EXISTS (SELECT 1 FROM public.tenants tn JOIN public.partner_members pm ON pm.partner_id = tn.partner_id
             WHERE tn.id = tenant_package_bookings.tenant_id AND pm.user_id = auth.uid())
  OR tenant_id = public.get_user_tenant_id()
);

INSERT INTO public.pricing_packages (code,name,uvp,ek,requires_package,requires_any_other,always_active,sort) VALUES
 ('basis','Basis',0,0,NULL,false,true,0),
 ('p1_monitoring','Monitoring & Alarmierung',99,74,NULL,false,false,1),
 ('p2_analysis','Analyse & Energieberichte',49,37,'p1_monitoring',false,false,2),
 ('p3_automation','Gebäudeautomation',79,59,'p1_monitoring',false,false,3),
 ('p4_charging','Ladeinfrastruktur',0,0,NULL,false,false,4),
 ('p5_flex','Flexibilität & Energiehandel',99,74,'p1_monitoring',false,false,5),
 ('p6_enterprise','Multi-Site & Enterprise',199,149,NULL,true,false,6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pricing_package_modules (package_code,module_code) VALUES
 ('basis','dashboard'),('basis','locations'),('basis','floor_plans'),('basis','documentation'),
 ('p1_monitoring','energy_monitoring'),('p1_monitoring','live_values'),('p1_monitoring','integrations'),('p1_monitoring','alerts'),('p1_monitoring','meter_scanning'),
 ('p2_analysis','analytics_studio'),('p2_analysis','energy_report'),
 ('p3_automation','automation_multi'),
 ('p4_charging','ev_charging'),('p4_charging','adhoc_payment'),
 ('p5_flex','peak_shaving'),('p5_flex','arbitrage_trading'),
 ('p6_enterprise','locations'),('p6_enterprise','network_infra'),('p6_enterprise','brighthub_api'),('p6_enterprise','c_level_dashboard')
ON CONFLICT DO NOTHING;

INSERT INTO public.pricing_unit_prices (code,name,uvp,ek,unit) VALUES
 ('extra_location','Weitere Liegenschaft',39,29,'Monat'),
 ('charge_point','Ladepunkt',7.00,5.25,'Monat'),
 ('charging_session','Abgerechneter Ladevorgang',0.10,0.07,'Vorgang'),
 ('setup','Einrichtung',200,200,'einmalig'),
 ('support_15min','Support je angefangene 15 Minuten',25,25,'15 Minuten'),
 ('remote_support','Remote-Support',149,149,'Monat')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.module_catalog_flags (module_code,visibility) VALUES
 ('reporting','hidden'),('automation_building','hidden'),('task_management','hidden'),
 ('tenant_electricity','on_request'),('energy_sharing','on_request'),('ppa_onsite','on_request'),('ppa_offsite','on_request'),('gain_sharing','on_request')
ON CONFLICT (module_code) DO NOTHING;

COMMENT ON COLUMN public.module_prices.industry_price_monthly IS 'DEPRECATED (Anzeige): Kommunen/Industrie-Preise entfallen vorerst, Daten bleiben erhalten';
COMMENT ON COLUMN public.module_prices.industry_standard_price IS 'DEPRECATED (Anzeige): Kommunen/Industrie-Preise entfallen vorerst, Daten bleiben erhalten';