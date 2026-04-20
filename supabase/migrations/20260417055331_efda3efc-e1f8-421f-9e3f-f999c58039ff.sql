CREATE TABLE public.mqtt_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  topic_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);

CREATE INDEX idx_mqtt_credentials_tenant ON public.mqtt_credentials(tenant_id);
CREATE INDEX idx_mqtt_credentials_username ON public.mqtt_credentials(username);

ALTER TABLE public.mqtt_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own tenant mqtt credentials"
ON public.mqtt_credentials
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND tenant_id = public.get_user_tenant_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND tenant_id = public.get_user_tenant_id()
  )
);

CREATE TRIGGER update_mqtt_credentials_updated_at
BEFORE UPDATE ON public.mqtt_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();