
CREATE TABLE public.loxone_template_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_miniserver_fw TEXT,
  changelog TEXT,
  snippet_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, version)
);

GRANT SELECT ON public.loxone_template_registry TO authenticated;
GRANT ALL ON public.loxone_template_registry TO service_role;
ALTER TABLE public.loxone_template_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Katalog fuer alle Angemeldeten lesbar"
  ON public.loxone_template_registry FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Nur Super-Admin pflegt Katalog"
  ON public.loxone_template_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.location_loxone_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  installed_version TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  vi_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, template_key, instance_id)
);

CREATE INDEX idx_location_loxone_templates_tenant ON public.location_loxone_templates(tenant_id);
CREATE INDEX idx_location_loxone_templates_location ON public.location_loxone_templates(location_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_loxone_templates TO authenticated;
GRANT ALL ON public.location_loxone_templates TO service_role;
ALTER TABLE public.location_loxone_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant liest eigene Installationen"
  ON public.location_loxone_templates FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant-Admins verwalten Installationen"
  ON public.location_loxone_templates FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (tenant_id = public.get_user_tenant_id()
        AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR (tenant_id = public.get_user_tenant_id()
        AND public.has_role(auth.uid(), 'admin'))
  );

ALTER TABLE public.location_automations
  ADD COLUMN IF NOT EXISTS loxone_template_key TEXT,
  ADD COLUMN IF NOT EXISTS loxone_template_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS loxone_template_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'cloud'
    CHECK (execution_mode IN ('cloud', 'loxone_local', 'hybrid'));

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_loxone_template_registry_touch ON public.loxone_template_registry;
CREATE TRIGGER trg_loxone_template_registry_touch
  BEFORE UPDATE ON public.loxone_template_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_location_loxone_templates_touch ON public.location_loxone_templates;
CREATE TRIGGER trg_location_loxone_templates_touch
  BEFORE UPDATE ON public.location_loxone_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
