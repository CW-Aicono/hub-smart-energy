
-- Pairing tokens for AICONO Gateway Hub provisioning
CREATE TABLE public.gateway_pairing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  bound_to_mac text,
  bound_device_id uuid REFERENCES public.gateway_devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_gateway_pairing_tokens_tenant ON public.gateway_pairing_tokens(tenant_id);
CREATE INDEX idx_gateway_pairing_tokens_token ON public.gateway_pairing_tokens(token) WHERE used_at IS NULL;

ALTER TABLE public.gateway_pairing_tokens ENABLE ROW LEVEL SECURITY;

-- Tenant admins manage their own pairing tokens
CREATE POLICY "tenant admins read own pairing tokens"
  ON public.gateway_pairing_tokens FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );

CREATE POLICY "tenant admins insert own pairing tokens"
  ON public.gateway_pairing_tokens FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );

CREATE POLICY "tenant admins delete own pairing tokens"
  ON public.gateway_pairing_tokens FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );
