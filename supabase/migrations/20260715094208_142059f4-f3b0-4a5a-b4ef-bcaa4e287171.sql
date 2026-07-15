
-- ============ 1. ENUM ============
CREATE TYPE public.document_scope AS ENUM (
  'tenant','location','meter','charge_point','gateway_device','energy_storage','energy_supplier_invoice'
);

-- ============ 2. TABLES ============
CREATE TABLE public.document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_categories TO authenticated;
GRANT ALL ON public.document_categories TO service_role;

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.document_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  valid_from DATE,
  valid_until DATE,
  current_version_id UUID,
  latest_version_no INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
CREATE INDEX idx_documents_tenant ON public.documents(tenant_id);
CREATE INDEX idx_documents_category ON public.documents(category_id);

CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  file_hash TEXT,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
CREATE INDEX idx_document_versions_doc ON public.document_versions(document_id);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope public.document_scope NOT NULL,
  scope_id UUID,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_links_scope_id_check CHECK (
    (scope = 'tenant' AND scope_id IS NULL) OR (scope <> 'tenant' AND scope_id IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated;
GRANT ALL ON public.document_links TO service_role;
CREATE UNIQUE INDEX ux_document_links_scope ON public.document_links(document_id, scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_document_links_scope_lookup ON public.document_links(scope, scope_id);
CREATE INDEX idx_document_links_location ON public.document_links(location_id);
CREATE INDEX idx_document_links_tenant ON public.document_links(tenant_id);

CREATE TABLE public.document_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.document_categories(id) ON DELETE CASCADE,
  role public.app_role,
  custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_download BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dar_target_check CHECK (
    (document_id IS NOT NULL AND category_id IS NULL) OR
    (document_id IS NULL AND category_id IS NOT NULL)
  ),
  CONSTRAINT dar_role_check CHECK (
    (role IS NOT NULL AND custom_role_id IS NULL) OR
    (role IS NULL AND custom_role_id IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_access_rules TO authenticated;
GRANT ALL ON public.document_access_rules TO service_role;
CREATE INDEX idx_dar_document ON public.document_access_rules(document_id);
CREATE INDEX idx_dar_category ON public.document_access_rules(category_id);

-- ============ 3. ACCESS CHECK FUNCTION ============
CREATE OR REPLACE FUNCTION public.can_access_document(_user_id UUID, _doc_id UUID, _action TEXT DEFAULT 'view')
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_category_id UUID;
  v_created_by UUID;
  v_col TEXT;
  v_allowed BOOLEAN := false;
BEGIN
  IF _user_id IS NULL OR _doc_id IS NULL THEN RETURN false; END IF;

  -- Super admin bypass
  IF public.has_role(_user_id, 'super_admin') THEN RETURN true; END IF;

  SELECT tenant_id, category_id, created_by
    INTO v_tenant_id, v_category_id, v_created_by
    FROM public.documents WHERE id = _doc_id;
  IF v_tenant_id IS NULL THEN RETURN false; END IF;

  -- User must belong to tenant
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND tenant_id = v_tenant_id) THEN
    RETURN false;
  END IF;

  -- Creator always has view/download/edit; delete only for admin
  IF v_created_by = _user_id AND _action IN ('view','download','edit') THEN
    RETURN true;
  END IF;

  -- Tenant admin has full access
  IF public.has_role(_user_id, 'admin') THEN RETURN true; END IF;

  v_col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'download' THEN 'can_download'
    WHEN 'edit' THEN 'can_edit'
    WHEN 'delete' THEN 'can_delete'
    ELSE 'can_view'
  END;

  -- Document-level rules (role)
  EXECUTE format($f$
    SELECT EXISTS (
      SELECT 1 FROM public.document_access_rules dar
      WHERE dar.document_id = $1
        AND dar.role IS NOT NULL
        AND public.has_role($2, dar.role)
        AND dar.%I = true
    )$f$, v_col) INTO v_allowed USING _doc_id, _user_id;
  IF v_allowed THEN RETURN true; END IF;

  -- Document-level rules (custom role)
  EXECUTE format($f$
    SELECT EXISTS (
      SELECT 1 FROM public.document_access_rules dar
      JOIN public.user_roles ur ON ur.user_id = $2
      WHERE dar.document_id = $1
        AND dar.custom_role_id IS NOT NULL
        AND dar.%I = true
    )$f$, v_col) INTO v_allowed USING _doc_id, _user_id;
  IF v_allowed THEN RETURN true; END IF;

  -- Category-level rules (role)
  IF v_category_id IS NOT NULL THEN
    EXECUTE format($f$
      SELECT EXISTS (
        SELECT 1 FROM public.document_access_rules dar
        WHERE dar.category_id = $1
          AND dar.role IS NOT NULL
          AND public.has_role($2, dar.role)
          AND dar.%I = true
      )$f$, v_col) INTO v_allowed USING v_category_id, _user_id;
    IF v_allowed THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

-- ============ 4. TRIGGERS ============
CREATE OR REPLACE FUNCTION public.tg_document_version_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.documents
    SET current_version_id = NEW.id,
        latest_version_no = GREATEST(latest_version_no, NEW.version_no),
        updated_at = now()
    WHERE id = NEW.document_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_document_version_after_insert
AFTER INSERT ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_document_version_after_insert();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_categories_updated BEFORE UPDATE ON public.document_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_access_rules_updated BEFORE UPDATE ON public.document_access_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 5. RLS ============
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view categories" ON public.document_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_categories.tenant_id));
CREATE POLICY "Admins manage categories" ON public.document_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_categories.tenant_id)))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_categories.tenant_id)));

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View documents via can_access_document" ON public.documents FOR SELECT TO authenticated
  USING (public.can_access_document(auth.uid(), id, 'view'));
CREATE POLICY "Tenant members insert documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = documents.tenant_id)
  );
CREATE POLICY "Edit documents via can_access_document" ON public.documents FOR UPDATE TO authenticated
  USING (public.can_access_document(auth.uid(), id, 'edit'))
  WITH CHECK (public.can_access_document(auth.uid(), id, 'edit'));
CREATE POLICY "Delete documents via can_access_document" ON public.documents FOR DELETE TO authenticated
  USING (public.can_access_document(auth.uid(), id, 'delete'));

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View versions via document access" ON public.document_versions FOR SELECT TO authenticated
  USING (public.can_access_document(auth.uid(), document_id, 'view'));
CREATE POLICY "Insert versions via edit access" ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_access_document(auth.uid(), document_id, 'edit') OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.created_by = auth.uid()));
CREATE POLICY "Delete versions via edit access" ON public.document_versions FOR DELETE TO authenticated
  USING (public.can_access_document(auth.uid(), document_id, 'delete'));

ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View links via document view" ON public.document_links FOR SELECT TO authenticated
  USING (public.can_access_document(auth.uid(), document_id, 'view'));
CREATE POLICY "Manage links via edit access" ON public.document_links FOR ALL TO authenticated
  USING (public.can_access_document(auth.uid(), document_id, 'edit'))
  WITH CHECK (public.can_access_document(auth.uid(), document_id, 'edit'));

ALTER TABLE public.document_access_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View access rules within tenant" ON public.document_access_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_access_rules.tenant_id));
CREATE POLICY "Admins manage access rules" ON public.document_access_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_access_rules.tenant_id)))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND tenant_id = document_access_rules.tenant_id)));

-- ============ 6. STORAGE POLICIES ============
CREATE POLICY "tenant-documents authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name,'/',1)
    )
  );
CREATE POLICY "tenant-documents tenant member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND (
      public.has_role(auth.uid(),'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id::text = split_part(name,'/',1)
      )
    )
  );
CREATE POLICY "tenant-documents tenant admin manage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND (
      public.has_role(auth.uid(),'super_admin')
      OR (public.has_role(auth.uid(),'admin') AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id::text = split_part(name,'/',1)
      ))
    )
  );

-- ============ 7. SEED CATEGORIES FOR EXISTING TENANTS ============
INSERT INTO public.document_categories (tenant_id, name, slug, icon, color, sort_order, is_system)
SELECT t.id, x.name, x.slug, x.icon, x.color, x.sort_order, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('Allgemein','allgemein','FileText','#64748b',10),
  ('Bedienungsanleitung','anleitung','BookOpen','#0ea5e9',20),
  ('Foto','foto','Image','#10b981',30),
  ('Rechnung','rechnung','Receipt','#f59e0b',40),
  ('Netzwerk / IP','netzwerk','Network','#8b5cf6',50),
  ('Vertrag','vertrag','FileSignature','#ef4444',60),
  ('Zertifikat','zertifikat','BadgeCheck','#22c55e',70)
) AS x(name, slug, icon, color, sort_order)
ON CONFLICT DO NOTHING;

-- Auto-seed for future tenants
CREATE OR REPLACE FUNCTION public.tg_seed_document_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.document_categories (tenant_id, name, slug, icon, color, sort_order, is_system) VALUES
    (NEW.id,'Allgemein','allgemein','FileText','#64748b',10,true),
    (NEW.id,'Bedienungsanleitung','anleitung','BookOpen','#0ea5e9',20,true),
    (NEW.id,'Foto','foto','Image','#10b981',30,true),
    (NEW.id,'Rechnung','rechnung','Receipt','#f59e0b',40,true),
    (NEW.id,'Netzwerk / IP','netzwerk','Network','#8b5cf6',50,true),
    (NEW.id,'Vertrag','vertrag','FileSignature','#ef4444',60,true),
    (NEW.id,'Zertifikat','zertifikat','BadgeCheck','#22c55e',70,true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tenant_seed_document_categories
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_document_categories();

-- ============ 8. PERMISSIONS SEED ============
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('documents.view','Dokumente ansehen','Dokumente einsehen (nach Regeln)','documentation'),
  ('documents.upload','Dokumente hochladen','Neue Dokumente hochladen','documentation'),
  ('documents.edit','Dokumente bearbeiten','Metadaten und neue Versionen','documentation'),
  ('documents.delete','Dokumente löschen','Dokumente entfernen','documentation'),
  ('documents.manage_access','Zugriff verwalten','Zugriffsregeln bearbeiten','documentation'),
  ('documents.manage_categories','Kategorien verwalten','Dokumentkategorien pflegen','documentation')
ON CONFLICT (code) DO NOTHING;

-- ============ 9. MODULE PRICE ============
INSERT INTO public.module_prices (module_code, price_monthly, standard_price, industry_price_monthly, industry_standard_price, partner_price_monthly, partner_industry_price_monthly)
VALUES ('documentation', 9, 9, 12, 12, 6, 8)
ON CONFLICT (module_code) DO NOTHING;
