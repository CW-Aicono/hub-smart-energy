-- Make legal_pages platform-wide instead of per-tenant
-- Drop existing RLS policies
DROP POLICY IF EXISTS "Legal pages are publicly readable" ON public.legal_pages;
DROP POLICY IF EXISTS "Admins can manage legal pages" ON public.legal_pages;

-- Make tenant_id nullable and set to null for platform-wide content
ALTER TABLE public.legal_pages ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.legal_pages ALTER COLUMN tenant_id SET DEFAULT NULL;

-- Update existing rows to be platform-wide
UPDATE public.legal_pages SET tenant_id = NULL;

-- Drop old unique constraint and add new one for platform-wide pages
ALTER TABLE public.legal_pages DROP CONSTRAINT IF EXISTS legal_pages_tenant_id_page_key_key;
ALTER TABLE public.legal_pages ADD CONSTRAINT legal_pages_page_key_unique UNIQUE (page_key);

-- New RLS: anyone can read
CREATE POLICY "Legal pages are publicly readable"
ON public.legal_pages FOR SELECT USING (true);

-- Only super_admins can insert/update/delete
CREATE POLICY "Super admins can manage legal pages"
ON public.legal_pages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));