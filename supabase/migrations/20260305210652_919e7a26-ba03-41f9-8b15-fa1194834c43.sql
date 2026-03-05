
-- External service provider contacts table
CREATE TABLE public.external_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenant users can manage their own tenant's contacts
CREATE POLICY "Users can view own tenant contacts"
  ON public.external_contacts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert own tenant contacts"
  ON public.external_contacts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update own tenant contacts"
  ON public.external_contacts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete own tenant contacts"
  ON public.external_contacts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Updated_at trigger
CREATE TRIGGER update_external_contacts_updated_at
  BEFORE UPDATE ON public.external_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
