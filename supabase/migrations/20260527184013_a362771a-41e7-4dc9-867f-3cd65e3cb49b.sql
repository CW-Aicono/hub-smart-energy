
-- 1) Erweitere app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'community_member';

-- 2) energy_communities
CREATE TABLE public.energy_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  region_plz text[] NOT NULL DEFAULT '{}',
  type text NOT NULL DEFAULT 'nachbarschaft',
  status text NOT NULL DEFAULT 'draft',
  contract_template_id uuid,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);
CREATE INDEX idx_energy_communities_tenant ON public.energy_communities(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_communities TO authenticated;
GRANT ALL ON public.energy_communities TO service_role;
ALTER TABLE public.energy_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage own communities"
ON public.energy_communities FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_energy_communities_updated_at
BEFORE UPDATE ON public.energy_communities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) community_members
CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid,
  member_no text,
  email text,
  display_name text,
  joined_at date,
  left_at date,
  role text NOT NULL DEFAULT 'member',
  malo_id text,
  melo_id text,
  share_kw numeric(10,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_members_community ON public.community_members(community_id);
CREATE INDEX idx_community_members_tenant ON public.community_members(tenant_id);
CREATE INDEX idx_community_members_user ON public.community_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage own community members"
ON public.community_members FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Members can view own membership"
ON public.community_members FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_community_members_updated_at
BEFORE UPDATE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) community_assets
CREATE TABLE public.community_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  location_id uuid,
  meter_id uuid,
  asset_type text NOT NULL DEFAULT 'pv',
  capacity_kw numeric(10,3) NOT NULL DEFAULT 0,
  share_model text NOT NULL DEFAULT 'gleich',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_assets_community ON public.community_assets(community_id);
CREATE INDEX idx_community_assets_tenant ON public.community_assets(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_assets TO authenticated;
GRANT ALL ON public.community_assets TO service_role;
ALTER TABLE public.community_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage own community assets"
ON public.community_assets FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_community_assets_updated_at
BEFORE UPDATE ON public.community_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) community_tariffs
CREATE TABLE public.community_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  price_ct_kwh numeric(8,3) NOT NULL DEFAULT 0,
  feed_in_ct_kwh numeric(8,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_tariffs_community ON public.community_tariffs(community_id);
CREATE INDEX idx_community_tariffs_tenant ON public.community_tariffs(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_tariffs TO authenticated;
GRANT ALL ON public.community_tariffs TO service_role;
ALTER TABLE public.community_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage own community tariffs"
ON public.community_tariffs FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_community_tariffs_updated_at
BEFORE UPDATE ON public.community_tariffs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
