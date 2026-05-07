
-- Phase 2: Remote-Administration des AICONO Gateways
-- Tabelle für versionierte, aus dem Backend gepushte Gateway-Konfiguration.

CREATE TABLE public.gateway_device_config (
  gateway_device_id uuid PRIMARY KEY REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gateway_device_config_tenant_idx
  ON public.gateway_device_config(tenant_id);

ALTER TABLE public.gateway_device_config ENABLE ROW LEVEL SECURITY;

-- Tenant-User mit Zugriff auf das Gateway-Device dürfen lesen.
CREATE POLICY "Tenant members can view their gateway config"
  ON public.gateway_device_config
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Schreiben nur Tenant-Admins oder Super-Admins.
CREATE POLICY "Admins can insert gateway config"
  ON public.gateway_device_config
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_user_tenant_id()
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_permission(auth.uid(), 'gateway.manage')))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Admins can update gateway config"
  ON public.gateway_device_config
  FOR UPDATE
  USING (
    (tenant_id = public.get_user_tenant_id()
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_permission(auth.uid(), 'gateway.manage')))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Admins can delete gateway config"
  ON public.gateway_device_config
  FOR DELETE
  USING (
    (tenant_id = public.get_user_tenant_id()
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_permission(auth.uid(), 'gateway.manage')))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Trigger: updated_at + version bump bei jedem UPDATE.
CREATE OR REPLACE FUNCTION public.bump_gateway_device_config_version()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND NEW.config IS DISTINCT FROM OLD.config THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gateway_device_config_version
  BEFORE UPDATE ON public.gateway_device_config
  FOR EACH ROW EXECUTE FUNCTION public.bump_gateway_device_config_version();

-- Realtime aktivieren, damit die gateway-ws Edge Function Änderungen pushen kann.
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_device_config;
ALTER TABLE public.gateway_device_config REPLICA IDENTITY FULL;
