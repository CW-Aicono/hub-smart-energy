-- Add unique constraint on (tenant_id, app_tag) so we can ON CONFLICT cleanly
ALTER TABLE public.charging_users
  ADD CONSTRAINT charging_users_tenant_app_tag_unique UNIQUE (tenant_id, app_tag);

-- Seed a Backend-Service charging user per existing tenant for backend-triggered RemoteStarts
INSERT INTO public.charging_users (tenant_id, name, app_tag, status)
SELECT t.id, 'Backend Remote-Start', 'APPBACKEND00', 'active'
FROM public.tenants t
ON CONFLICT (tenant_id, app_tag) DO NOTHING;

-- Trigger to auto-provision the service user for any new tenant
CREATE OR REPLACE FUNCTION public.create_backend_charging_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.charging_users (tenant_id, name, app_tag, status)
  VALUES (NEW.id, 'Backend Remote-Start', 'APPBACKEND00', 'active')
  ON CONFLICT (tenant_id, app_tag) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_backend_charging_user ON public.tenants;
CREATE TRIGGER trg_create_backend_charging_user
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.create_backend_charging_user();