-- Idempotent: tenant scope hardening for updates and cross-tenant references.

-- 1) UPDATE policies: rows must stay inside the caller's tenant after update.
ALTER POLICY "Admins can update charge points" ON public.charge_points
  WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Admins can update charging invoices" ON public.charging_invoices
  WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Admins can update charging sessions" ON public.charging_sessions
  WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Tenant members can update their gateway commands" ON public.gateway_commands
  WITH CHECK (tenant_id = public.get_user_tenant_id());
ALTER POLICY "Tenant integrations admins update wallbox instances" ON public.wallbox_modbus_instances
  WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.has_permission(auth.uid(), 'integrations.edit'::text));

-- 2) Referenced gateway / location / charge point must belong to the same tenant.
CREATE OR REPLACE FUNCTION public.enforce_same_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Server jobs (service role, no user) and Super-Admins are not restricted here.
  IF v_uid IS NULL OR public.has_role(v_uid, 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'gateway_commands' THEN
    IF NEW.gateway_device_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.gateway_devices g WHERE g.id = NEW.gateway_device_id AND g.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'gateway device does not belong to tenant' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'wallbox_modbus_instances' THEN
    IF NEW.gateway_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.gateway_devices g WHERE g.id = NEW.gateway_id AND g.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'gateway does not belong to tenant' USING ERRCODE = '42501';
    END IF;
    IF NEW.location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.locations l WHERE l.id = NEW.location_id AND l.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'location does not belong to tenant' USING ERRCODE = '42501';
    END IF;
    IF NEW.charge_point_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.charge_points c WHERE c.id = NEW.charge_point_id AND c.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'charge point does not belong to tenant' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gateway_commands_same_tenant ON public.gateway_commands;
CREATE TRIGGER trg_gateway_commands_same_tenant
  BEFORE INSERT OR UPDATE ON public.gateway_commands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_tenant_refs();

DROP TRIGGER IF EXISTS trg_wallbox_instances_same_tenant ON public.wallbox_modbus_instances;
CREATE TRIGGER trg_wallbox_instances_same_tenant
  BEFORE INSERT OR UPDATE ON public.wallbox_modbus_instances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_tenant_refs();