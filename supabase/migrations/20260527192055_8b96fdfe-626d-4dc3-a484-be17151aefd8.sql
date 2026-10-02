
-- ── Vertragsschablonen ──────────────────────────────────────────────────────
CREATE TABLE public.community_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  body_markdown text NOT NULL,
  placeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cct_tenant ON public.community_contract_templates(tenant_id);
CREATE INDEX idx_cct_community ON public.community_contract_templates(community_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_contract_templates TO authenticated;
GRANT ALL ON public.community_contract_templates TO service_role;

ALTER TABLE public.community_contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read templates" ON public.community_contract_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant write templates" ON public.community_contract_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_cct_updated_at BEFORE UPDATE ON public.community_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Unterschriften ──────────────────────────────────────────────────────────
CREATE TABLE public.community_member_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.community_contract_templates(id) ON DELETE RESTRICT,
  template_version integer NOT NULL,
  signer_name text NOT NULL,
  signer_ip text NULL,
  user_agent text NULL,
  body_hash text NOT NULL,
  signed_body text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_tenant ON public.community_member_signatures(tenant_id);
CREATE INDEX idx_cms_member ON public.community_member_signatures(member_id);

GRANT SELECT, INSERT ON public.community_member_signatures TO authenticated;
GRANT ALL ON public.community_member_signatures TO service_role;

ALTER TABLE public.community_member_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read signatures" ON public.community_member_signatures
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant insert signatures" ON public.community_member_signatures
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

-- ── Storage Bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('community-contracts', 'community-contracts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant read community contract files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-contracts'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );

CREATE POLICY "tenant write community contract files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-contracts'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );

CREATE POLICY "tenant delete community contract files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-contracts'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );
