
-- Legal pages (Datenschutz, Impressum) editable by tenant admins
CREATE TABLE public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_key text NOT NULL, -- 'datenschutz' or 'impressum'
  title text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (tenant_id, page_key)
);

ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public pages)
CREATE POLICY "Legal pages are publicly readable"
  ON public.legal_pages FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only tenant admins can update
CREATE POLICY "Admins can manage legal pages"
  ON public.legal_pages FOR ALL
  TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger for updated_at
CREATE TRIGGER update_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
