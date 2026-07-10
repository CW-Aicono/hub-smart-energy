
CREATE TABLE IF NOT EXISTS public.tenant_partner_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  to_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  from_support_owner text,
  to_support_owner text,
  reason text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_partner_transfers TO authenticated;
GRANT ALL ON public.tenant_partner_transfers TO service_role;

ALTER TABLE public.tenant_partner_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all tenant transfers"
  ON public.tenant_partner_transfers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_tenant_partner_transfers_tenant ON public.tenant_partner_transfers(tenant_id, created_at DESC);
