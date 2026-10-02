
-- ============================================================
-- PPA-Management Modul (Phase 1)
-- ============================================================

CREATE TABLE public.ppa_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ppa_type text NOT NULL CHECK (ppa_type IN ('onsite','offsite')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','expired','terminated')),
  producer_name text NOT NULL,
  producer_market_id text,
  offtaker_name text NOT NULL,
  offtaker_market_id text,
  contract_start date NOT NULL,
  contract_end date NOT NULL,
  notice_period_days integer NOT NULL DEFAULT 90,
  auto_renewal boolean NOT NULL DEFAULT false,
  contracted_volume_kwh_pa numeric(12,2),
  price_model text NOT NULL CHECK (price_model IN ('fixed','index_linked','spot_plus_premium','floor_cap')),
  price_eur_per_kwh numeric(8,5),
  price_formula jsonb,
  plant_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  plant_description text,
  plant_capacity_kw numeric(10,2),
  energy_source text NOT NULL DEFAULT 'solar' CHECK (energy_source IN ('solar','wind','hydro','biomass','mixed')),
  goo_required boolean NOT NULL DEFAULT false,
  goo_registry text,
  mieterstrom_settings_id uuid REFERENCES public.tenant_electricity_settings(id) ON DELETE SET NULL,
  reference_number text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppa_contracts_dates_valid CHECK (contract_end >= contract_start),
  CONSTRAINT ppa_contracts_fixed_price CHECK (price_model <> 'fixed' OR price_eur_per_kwh IS NOT NULL)
);

CREATE INDEX idx_ppa_contracts_tenant ON public.ppa_contracts(tenant_id);
CREATE INDEX idx_ppa_contracts_status ON public.ppa_contracts(tenant_id, status);
CREATE INDEX idx_ppa_contracts_type ON public.ppa_contracts(tenant_id, ppa_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_contracts TO authenticated;
GRANT ALL ON public.ppa_contracts TO service_role;
ALTER TABLE public.ppa_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ppa_contracts_select" ON public.ppa_contracts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "ppa_contracts_insert" ON public.ppa_contracts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));
CREATE POLICY "ppa_contracts_update" ON public.ppa_contracts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));
CREATE POLICY "ppa_contracts_delete" ON public.ppa_contracts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));

CREATE TRIGGER update_ppa_contracts_updated_at BEFORE UPDATE ON public.ppa_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_ppa_price_formula()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.price_model = 'fixed' THEN
    RETURN NEW;
  END IF;
  IF NEW.price_formula IS NULL THEN
    RAISE EXCEPTION 'price_formula required for price_model %', NEW.price_model;
  END IF;
  IF NEW.price_model = 'spot_plus_premium' THEN
    IF NOT (NEW.price_formula ? 'premium') THEN
      RAISE EXCEPTION 'price_formula must contain "premium" for spot_plus_premium';
    END IF;
  ELSIF NEW.price_model = 'floor_cap' THEN
    IF NOT (NEW.price_formula ? 'floor' AND NEW.price_formula ? 'cap') THEN
      RAISE EXCEPTION 'price_formula must contain "floor" and "cap" for floor_cap';
    END IF;
    IF (NEW.price_formula->>'floor')::numeric > (NEW.price_formula->>'cap')::numeric THEN
      RAISE EXCEPTION 'floor must be <= cap';
    END IF;
  ELSIF NEW.price_model = 'index_linked' THEN
    IF NOT (NEW.price_formula ? 'factor' AND NEW.price_formula ? 'offset') THEN
      RAISE EXCEPTION 'price_formula must contain "factor" and "offset" for index_linked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_ppa_price_formula
  BEFORE INSERT OR UPDATE OF price_model, price_formula, price_eur_per_kwh ON public.ppa_contracts
  FOR EACH ROW EXECUTE FUNCTION public.validate_ppa_price_formula();

-- Status history
CREATE TABLE public.ppa_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX idx_ppa_status_history_contract ON public.ppa_status_history(contract_id, changed_at DESC);

GRANT SELECT, INSERT ON public.ppa_status_history TO authenticated;
GRANT ALL ON public.ppa_status_history TO service_role;
ALTER TABLE public.ppa_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ppa_status_history_select" ON public.ppa_status_history FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_status_history_insert" ON public.ppa_status_history FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_ppa_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_allowed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ppa_status_history(contract_id, tenant_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.tenant_id, NULL, NEW.status, auth.uid());
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_allowed := CASE
      WHEN OLD.status = 'draft' AND NEW.status IN ('active','terminated') THEN true
      WHEN OLD.status = 'active' AND NEW.status IN ('suspended','expired','terminated') THEN true
      WHEN OLD.status = 'suspended' AND NEW.status IN ('active','terminated') THEN true
      ELSE false
    END;
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Invalid PPA status transition: % -> %', OLD.status, NEW.status;
    END IF;
    INSERT INTO public.ppa_status_history(contract_id, tenant_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.tenant_id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_ppa_status_change
  AFTER INSERT OR UPDATE OF status ON public.ppa_contracts
  FOR EACH ROW EXECUTE FUNCTION public.log_ppa_status_change();

-- On-site config
CREATE TABLE public.ppa_onsite_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  building_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  supply_model text NOT NULL CHECK (supply_model IN ('direct_line','gemeinsame_gebaeude','mieterstrom')),
  generation_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  self_consumption_target_pct numeric(5,2),
  surplus_handling text NOT NULL DEFAULT 'grid_feed_in' CHECK (surplus_handling IN ('grid_feed_in','battery_storage','offsite_ppa')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppa_onsite_tenant ON public.ppa_onsite_config(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_onsite_config TO authenticated;
GRANT ALL ON public.ppa_onsite_config TO service_role;
ALTER TABLE public.ppa_onsite_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppa_onsite_select" ON public.ppa_onsite_config FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_onsite_write" ON public.ppa_onsite_config FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));
CREATE TRIGGER update_ppa_onsite_updated_at BEFORE UPDATE ON public.ppa_onsite_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Off-site config
CREATE TABLE public.ppa_offsite_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  plant_location text,
  plant_tso_area text CHECK (plant_tso_area IS NULL OR plant_tso_area IN ('TenneT','50Hertz','Amprion','TransnetBW')),
  plant_grid_level text CHECK (plant_grid_level IS NULL OR plant_grid_level IN ('HS','MS','NS')),
  balancing_responsible_party text,
  balancing_group_id text,
  delivery_type text NOT NULL CHECK (delivery_type IN ('physical','financial','sleeved')),
  intermediary_name text,
  intermediary_market_id text,
  imbalance_responsibility text NOT NULL DEFAULT 'producer' CHECK (imbalance_responsibility IN ('producer','offtaker','shared')),
  mscons_sender_id text,
  mscons_receiver_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppa_offsite_tenant ON public.ppa_offsite_config(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_offsite_config TO authenticated;
GRANT ALL ON public.ppa_offsite_config TO service_role;
ALTER TABLE public.ppa_offsite_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppa_offsite_select" ON public.ppa_offsite_config FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_offsite_write" ON public.ppa_offsite_config FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));
CREATE TRIGGER update_ppa_offsite_updated_at BEFORE UPDATE ON public.ppa_offsite_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Consumption meters join
CREATE TABLE public.ppa_consumption_meters (
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'consumption',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, meter_id)
);
CREATE INDEX idx_ppa_consumption_meters_meter ON public.ppa_consumption_meters(meter_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_consumption_meters TO authenticated;
GRANT ALL ON public.ppa_consumption_meters TO service_role;
ALTER TABLE public.ppa_consumption_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppa_cm_select" ON public.ppa_consumption_meters FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_cm_write" ON public.ppa_consumption_meters FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));

-- Documents
CREATE TABLE public.ppa_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('contract','amendment','goo_certificate','invoice','meter_report','termination','other')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_hash text,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppa_documents_contract ON public.ppa_documents(contract_id, created_at DESC);
CREATE UNIQUE INDEX idx_ppa_documents_hash ON public.ppa_documents(contract_id, file_hash) WHERE file_hash IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_documents TO authenticated;
GRANT ALL ON public.ppa_documents TO service_role;
ALTER TABLE public.ppa_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppa_docs_select" ON public.ppa_documents FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_docs_write" ON public.ppa_documents FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));

-- Settlement periods (Phase 2 ready)
CREATE TABLE public.ppa_settlement_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  contracted_kwh numeric(12,4),
  actual_produced_kwh numeric(12,4),
  actual_consumed_kwh numeric(12,4),
  deviation_kwh numeric(12,4) GENERATED ALWAYS AS (COALESCE(actual_produced_kwh,0) - COALESCE(contracted_kwh,0)) STORED,
  applicable_price_eur_per_kwh numeric(8,5),
  settlement_amount_eur numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','calculated','invoiced','paid','disputed')),
  data_source text NOT NULL DEFAULT 'imsys',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_start, period_end)
);
CREATE INDEX idx_ppa_settlement_tenant ON public.ppa_settlement_periods(tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_settlement_periods TO authenticated;
GRANT ALL ON public.ppa_settlement_periods TO service_role;
ALTER TABLE public.ppa_settlement_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppa_settlement_select" ON public.ppa_settlement_periods FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "ppa_settlement_write" ON public.ppa_settlement_periods FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ppa-documents', 'ppa-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ppa_docs_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ppa-documents'
    AND (split_part(name, '/', 1) = public.get_user_tenant_id()::text
         OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  );
CREATE POLICY "ppa_docs_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ppa-documents'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  );
CREATE POLICY "ppa_docs_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ppa-documents'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  );
CREATE POLICY "ppa_docs_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ppa-documents'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  );

-- Permissions
INSERT INTO public.permissions (code, name, description, category)
VALUES
  ('ppa.view',     'PPA-Verträge ansehen',  'PPA-Verträge anzeigen',           'ppa'),
  ('ppa.manage',   'PPA-Verträge verwalten','PPA-Verträge anlegen und bearbeiten','ppa'),
  ('ppa.activate', 'PPA-Verträge aktivieren','Verträge aktivieren/aussetzen/kündigen','ppa')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'super_admin'::public.app_role, p.id FROM public.permissions p WHERE p.code IN ('ppa.view','ppa.manage','ppa.activate')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, p.id FROM public.permissions p WHERE p.code IN ('ppa.view','ppa.manage','ppa.activate')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'user'::public.app_role, p.id FROM public.permissions p WHERE p.code = 'ppa.view'
ON CONFLICT DO NOTHING;
