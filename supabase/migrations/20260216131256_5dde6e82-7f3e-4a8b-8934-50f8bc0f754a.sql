
-- Table to store BrightHub API settings per tenant
CREATE TABLE public.brighthub_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_sync_readings BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.brighthub_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant brighthub settings"
  ON public.brighthub_settings FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert brighthub settings"
  ON public.brighthub_settings FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update brighthub settings"
  ON public.brighthub_settings FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete brighthub settings"
  ON public.brighthub_settings FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_brighthub_settings_updated_at
  BEFORE UPDATE ON public.brighthub_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
