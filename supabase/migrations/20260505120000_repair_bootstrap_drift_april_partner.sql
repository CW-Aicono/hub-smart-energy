-- Repair-Migration: Bootstrap-Drift fuer 20260418234425_*.sql
--
-- Auf prod (self-hosted) wurde apply-migrations.sh mit BOOTSTRAP=1 gestartet.
-- Das markiert ALLE damals vorhandenen Migrations als "applied", ohne sie auszufuehren.
-- Ergebnis fuer 20260418234425_32fece0c-... : tracked, aber DB-Schema kennt nichts davon —
-- weder enum-Wert 'sales_partner' (-> guard_privileged_roles-Trigger schlaegt bei jedem
-- auth.admin.createUser fehl, Edge-Function 400) noch die 8 Sales-Tabellen + Policies +
-- Trigger + Indizes + Storage-Buckets.
--
-- Dieser Repair zieht den vollstaendigen, idempotenten Inhalt der Original-Migration nach.
-- Sicher, weil alles mit IF NOT EXISTS / DROP IF EXISTS davor / ON CONFLICT DO NOTHING.
-- Falls weitere Bootstrap-Drifts auftauchen: analog vorgehen
-- (siehe memory/project_bootstrap_drift_repair.md).
--
-- ALTER TYPE ... ADD VALUE kann nicht in einer Tx laufen — apply-migrations.sh erkennt das
-- via migration_is_tx_safe und laesst --single-transaction fuer diese Datei weg.

-- 1. Add sales_partner role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_partner';

-- 2. Device Catalog (global, super-admin managed)
CREATE TABLE IF NOT EXISTS public.device_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hersteller text NOT NULL,
  modell text NOT NULL,
  beschreibung text,
  ek_preis numeric(10,2) NOT NULL DEFAULT 0,
  vk_preis numeric(10,2) NOT NULL DEFAULT 0,
  installations_pauschale numeric(10,2) NOT NULL DEFAULT 0,
  kompatibilitaet jsonb NOT NULL DEFAULT '{}'::jsonb,
  datasheet_url text,
  bild_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view active catalog" ON public.device_catalog;
CREATE POLICY "Authenticated can view active catalog"
  ON public.device_catalog FOR SELECT
  TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins manage catalog" ON public.device_catalog;
CREATE POLICY "Super admins manage catalog"
  ON public.device_catalog FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS trg_device_catalog_updated_at ON public.device_catalog;
CREATE TRIGGER trg_device_catalog_updated_at
  BEFORE UPDATE ON public.device_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Device Selection Rules
CREATE TABLE IF NOT EXISTS public.device_selection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  beschreibung text,
  bedingung jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_catalog_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE CASCADE,
  prio integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_selection_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view active rules" ON public.device_selection_rules;
CREATE POLICY "Authenticated can view active rules"
  ON public.device_selection_rules FOR SELECT
  TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins manage rules" ON public.device_selection_rules;
CREATE POLICY "Super admins manage rules"
  ON public.device_selection_rules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS trg_device_selection_rules_updated_at ON public.device_selection_rules;
CREATE TRIGGER trg_device_selection_rules_updated_at
  BEFORE UPDATE ON public.device_selection_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Sales Projects
CREATE TABLE IF NOT EXISTS public.sales_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kunde_name text NOT NULL,
  kunde_typ text NOT NULL DEFAULT 'standard', -- 'standard' | 'industry'
  kontakt_name text,
  kontakt_email text,
  kontakt_telefon text,
  adresse text,
  notizen text,
  status text NOT NULL DEFAULT 'draft', -- draft | sent | accepted | rejected | converted
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  accepted_at timestamptz,
  converted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner sees own projects" ON public.sales_projects;
CREATE POLICY "Partner sees own projects"
  ON public.sales_projects FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Partner manages own projects" ON public.sales_projects;
CREATE POLICY "Partner manages own projects"
  ON public.sales_projects FOR ALL
  TO authenticated
  USING (partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  WITH CHECK (partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS trg_sales_projects_updated_at ON public.sales_projects;
CREATE TRIGGER trg_sales_projects_updated_at
  BEFORE UPDATE ON public.sales_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_projects_partner ON public.sales_projects(partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_projects_status ON public.sales_projects(status);

-- 5. Sales Distributions (NSHV/UV)
CREATE TABLE IF NOT EXISTS public.sales_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.sales_projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.sales_distributions(id) ON DELETE CASCADE,
  name text NOT NULL,
  typ text NOT NULL DEFAULT 'UV', -- NSHV | UV
  standort text,
  foto_url text,
  ki_analyse jsonb,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access via project" ON public.sales_distributions;
CREATE POLICY "Access via project"
  ON public.sales_distributions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))));

DROP TRIGGER IF EXISTS trg_sales_distributions_updated_at ON public.sales_distributions;
CREATE TRIGGER trg_sales_distributions_updated_at
  BEFORE UPDATE ON public.sales_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_distributions_project ON public.sales_distributions(project_id);

-- 6. Sales Measurement Points
CREATE TABLE IF NOT EXISTS public.sales_measurement_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES public.sales_distributions(id) ON DELETE CASCADE,
  bezeichnung text NOT NULL,
  energieart text NOT NULL DEFAULT 'electricity',
  phasen integer NOT NULL DEFAULT 3, -- 1 oder 3
  strombereich_a numeric(8,2),
  spannung_v numeric(8,2) DEFAULT 230,
  anwendungsfall text, -- 'Hauptzähler' | 'Abgang' | 'Maschine' | 'PV' | 'Speicher' | etc.
  montage text, -- 'Hutschiene' | 'Wandlermessung' | 'Sammelschiene'
  bestand boolean NOT NULL DEFAULT false,
  bestand_geraet text,
  foto_url text,
  hinweise text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_measurement_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access via distribution->project" ON public.sales_measurement_points;
CREATE POLICY "Access via distribution->project"
  ON public.sales_measurement_points FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_distributions d
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE d.id = distribution_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_distributions d
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE d.id = distribution_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ));

DROP TRIGGER IF EXISTS trg_sales_mp_updated_at ON public.sales_measurement_points;
CREATE TRIGGER trg_sales_mp_updated_at
  BEFORE UPDATE ON public.sales_measurement_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_mp_distribution ON public.sales_measurement_points(distribution_id);

-- 7. Sales Recommended Devices
CREATE TABLE IF NOT EXISTS public.sales_recommended_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_point_id uuid NOT NULL REFERENCES public.sales_measurement_points(id) ON DELETE CASCADE,
  device_catalog_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE RESTRICT,
  begruendung text,
  ist_alternativ boolean NOT NULL DEFAULT false,
  partner_override boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'rule', -- rule | ai | manual
  menge integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_recommended_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access via mp->distribution->project" ON public.sales_recommended_devices;
CREATE POLICY "Access via mp->distribution->project"
  ON public.sales_recommended_devices FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_measurement_points mp
    JOIN public.sales_distributions d ON d.id = mp.distribution_id
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE mp.id = measurement_point_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_measurement_points mp
    JOIN public.sales_distributions d ON d.id = mp.distribution_id
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE mp.id = measurement_point_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ));

DROP TRIGGER IF EXISTS trg_sales_rec_updated_at ON public.sales_recommended_devices;
CREATE TRIGGER trg_sales_rec_updated_at
  BEFORE UPDATE ON public.sales_recommended_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_rec_mp ON public.sales_recommended_devices(measurement_point_id);

-- 8. Sales Quotes
CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.sales_projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  geraete_summe numeric(12,2) NOT NULL DEFAULT 0,
  installation_summe numeric(12,2) NOT NULL DEFAULT 0,
  total_einmalig numeric(12,2) NOT NULL DEFAULT 0,
  modul_summe_monatlich numeric(12,2) NOT NULL DEFAULT 0,
  pdf_storage_path text,
  signed_at timestamptz,
  signature_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access via project" ON public.sales_quotes;
CREATE POLICY "Access via project"
  ON public.sales_quotes FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))));

DROP TRIGGER IF EXISTS trg_sales_quotes_updated_at ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_updated_at
  BEFORE UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_quotes_project ON public.sales_quotes(project_id);

-- 9. Sales Quote Modules
CREATE TABLE IF NOT EXISTS public.sales_quote_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  preis_monatlich numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quote_id, module_code)
);

ALTER TABLE public.sales_quote_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access via quote->project" ON public.sales_quote_modules;
CREATE POLICY "Access via quote->project"
  ON public.sales_quote_modules FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_quotes q
    JOIN public.sales_projects p ON p.id = q.project_id
    WHERE q.id = quote_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_quotes q
    JOIN public.sales_projects p ON p.id = q.project_id
    WHERE q.id = quote_id AND (p.partner_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
  ));

-- 10. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('sales-photos', 'sales-photos', false),
  ('sales-quotes', 'sales-quotes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: sales-photos
DROP POLICY IF EXISTS "Sales partner uploads own photos" ON storage.objects;
CREATE POLICY "Sales partner uploads own photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sales-photos'
    AND (auth.uid()::text = split_part(name, '/', 1) OR has_role(auth.uid(), 'super_admin'))
  );

DROP POLICY IF EXISTS "Sales partner reads own photos" ON storage.objects;
CREATE POLICY "Sales partner reads own photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sales-photos'
    AND (auth.uid()::text = split_part(name, '/', 1) OR has_role(auth.uid(), 'super_admin'))
  );

DROP POLICY IF EXISTS "Sales partner deletes own photos" ON storage.objects;
CREATE POLICY "Sales partner deletes own photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sales-photos'
    AND (auth.uid()::text = split_part(name, '/', 1) OR has_role(auth.uid(), 'super_admin'))
  );

-- Storage policies: sales-quotes
DROP POLICY IF EXISTS "Sales partner reads own quotes" ON storage.objects;
CREATE POLICY "Sales partner reads own quotes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sales-quotes'
    AND (auth.uid()::text = split_part(name, '/', 1) OR has_role(auth.uid(), 'super_admin'))
  );

DROP POLICY IF EXISTS "Service role writes quotes" ON storage.objects;
CREATE POLICY "Service role writes quotes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sales-quotes'
    AND (auth.uid()::text = split_part(name, '/', 1) OR has_role(auth.uid(), 'super_admin'))
  );