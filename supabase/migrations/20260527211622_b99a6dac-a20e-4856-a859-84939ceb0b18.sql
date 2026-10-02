
-- ============================================================
-- Iter D · Stufe 1 — Marktplatz
-- ============================================================

-- 1. Marketplace Listings -------------------------------------
CREATE TABLE IF NOT EXISTS public.community_marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  short_description text,
  long_description text,
  region_plz text,
  region_city text,
  max_members integer,
  price_ct_kwh numeric(8,4),
  feed_in_ct_kwh numeric(8,4),
  hero_image_url text,
  is_public boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cml_tenant ON public.community_marketplace_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cml_community ON public.community_marketplace_listings(community_id);
CREATE INDEX IF NOT EXISTS idx_cml_public_plz ON public.community_marketplace_listings(is_public, region_plz) WHERE is_public = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_marketplace_listings TO authenticated;
GRANT ALL ON public.community_marketplace_listings TO service_role;

ALTER TABLE public.community_marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants manage own listings"
  ON public.community_marketplace_listings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_cml_updated_at BEFORE UPDATE ON public.community_marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. Join Requests --------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.community_marketplace_listings(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  plz text,
  city text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','rejected','withdrawn')),
  rejection_reason text,
  source_ip text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_member_id uuid REFERENCES public.community_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cjr_tenant_status ON public.community_join_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cjr_listing ON public.community_join_requests(listing_id);

GRANT SELECT, UPDATE ON public.community_join_requests TO authenticated;
GRANT ALL ON public.community_join_requests TO service_role;

ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants read own join requests"
  ON public.community_join_requests
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Tenants update own join requests"
  ON public.community_join_requests
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_cjr_updated_at BEFORE UPDATE ON public.community_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3. Storage Bucket -------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-marketplace', 'community-marketplace', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Marketplace images public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-marketplace');

CREATE POLICY "Tenants upload own marketplace images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-marketplace'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenants update own marketplace images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'community-marketplace'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenants delete own marketplace images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-marketplace'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );


-- 4. Public listing functions (SECURITY DEFINER) --------------
CREATE OR REPLACE FUNCTION public.community_marketplace_public_listings(p_plz text DEFAULT NULL)
RETURNS TABLE(
  slug text,
  title text,
  short_description text,
  hero_image_url text,
  region_plz text,
  region_city text,
  price_ct_kwh numeric,
  feed_in_ct_kwh numeric,
  max_members integer,
  current_members integer,
  total_capacity_kw numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.slug, l.title, l.short_description, l.hero_image_url,
    l.region_plz, l.region_city, l.price_ct_kwh, l.feed_in_ct_kwh,
    l.max_members,
    (SELECT count(*)::int FROM public.community_members cm
       WHERE cm.community_id = l.community_id AND cm.status = 'active'),
    (SELECT COALESCE(SUM(ca.capacity_kw), 0)::numeric FROM public.community_assets ca
       WHERE ca.community_id = l.community_id),
    l.created_at
  FROM public.community_marketplace_listings l
  WHERE l.is_public = true
    AND (p_plz IS NULL OR l.region_plz ILIKE p_plz || '%')
  ORDER BY l.created_at DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.community_marketplace_public_listings(text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.community_marketplace_public_detail(p_slug text)
RETURNS TABLE(
  slug text,
  community_id uuid,
  title text,
  short_description text,
  long_description text,
  hero_image_url text,
  region_plz text,
  region_city text,
  price_ct_kwh numeric,
  feed_in_ct_kwh numeric,
  max_members integer,
  current_members integer,
  total_capacity_kw numeric,
  contact_email text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.slug, l.community_id, l.title, l.short_description, l.long_description, l.hero_image_url,
    l.region_plz, l.region_city, l.price_ct_kwh, l.feed_in_ct_kwh, l.max_members,
    (SELECT count(*)::int FROM public.community_members cm
       WHERE cm.community_id = l.community_id AND cm.status = 'active'),
    (SELECT COALESCE(SUM(ca.capacity_kw), 0)::numeric FROM public.community_assets ca
       WHERE ca.community_id = l.community_id),
    l.contact_email, l.created_at
  FROM public.community_marketplace_listings l
  WHERE l.slug = p_slug AND l.is_public = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.community_marketplace_public_detail(text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.community_marketplace_increment_view(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_marketplace_listings
  SET view_count = view_count + 1
  WHERE slug = p_slug AND is_public = true;
$$;

GRANT EXECUTE ON FUNCTION public.community_marketplace_increment_view(text) TO anon, authenticated;
