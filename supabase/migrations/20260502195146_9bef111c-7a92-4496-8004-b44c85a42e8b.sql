CREATE TABLE public.public_charge_status_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_charge_status_links_token ON public.public_charge_status_links(token);

ALTER TABLE public.public_charge_status_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their tenant link"
  ON public.public_charge_status_links
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can insert their tenant link"
  ON public.public_charge_status_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can update their tenant link"
  ON public.public_charge_status_links
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can delete their tenant link"
  ON public.public_charge_status_links
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_public_charge_status_links_updated_at
  BEFORE UPDATE ON public.public_charge_status_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();