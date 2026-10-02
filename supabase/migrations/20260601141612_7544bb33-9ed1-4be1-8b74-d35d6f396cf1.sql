-- Stage 7: White-Label / Custom Domain
-- Add white-label fields to partners (logo_url, primary_color, custom_domain already exist)
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS white_label_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_display_name text,
  ADD COLUMN IF NOT EXISTS support_email text;

-- Public storage bucket for partner logos (logos sind sowieso öffentlich sichtbar im Branding)
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-assets', 'partner-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, super_admin write
DROP POLICY IF EXISTS "partner_assets_public_read" ON storage.objects;
CREATE POLICY "partner_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'partner-assets');

DROP POLICY IF EXISTS "partner_assets_super_admin_write" ON storage.objects;
CREATE POLICY "partner_assets_super_admin_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'partner-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "partner_assets_super_admin_update" ON storage.objects;
CREATE POLICY "partner_assets_super_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'partner-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "partner_assets_super_admin_delete" ON storage.objects;
CREATE POLICY "partner_assets_super_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'partner-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

-- Public RPC: branding-Auflösung per Hostname (für unauth Login-Seite auf partner.example.de)
CREATE OR REPLACE FUNCTION public.resolve_partner_branding_by_host(_host text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(p) - 'billing_address' - 'notes' - 'contact_phone' - 'contact_email'
  FROM public.partners p
  WHERE p.is_active = true
    AND p.white_label_enabled = true
    AND (
      lower(p.custom_domain) = lower(_host)
      OR (p.subdomain IS NOT NULL AND lower(_host) LIKE lower(p.subdomain) || '.%')
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_partner_branding_by_host(text) TO anon, authenticated;

-- RPC: Branding für tenant-user (eigenen Partner abrufen, ohne RLS-Hürden)
CREATE OR REPLACE FUNCTION public.get_partner_branding_for_tenant(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'partner_id', p.id,
    'name', p.name,
    'brand_display_name', p.brand_display_name,
    'logo_url', p.logo_url,
    'primary_color', p.primary_color,
    'secondary_color', p.secondary_color,
    'accent_color', p.accent_color,
    'custom_domain', p.custom_domain,
    'support_email', p.support_email,
    'white_label_enabled', p.white_label_enabled
  )
  FROM public.tenants t
  JOIN public.partners p ON p.id = t.partner_id
  WHERE t.id = _tenant_id
    AND p.is_active = true
    AND p.white_label_enabled = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_branding_for_tenant(uuid) TO authenticated;