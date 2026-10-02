
DROP POLICY IF EXISTS "Tenant gateway admins insert wallbox instances" ON public.wallbox_modbus_instances;
DROP POLICY IF EXISTS "Tenant gateway admins update wallbox instances" ON public.wallbox_modbus_instances;
DROP POLICY IF EXISTS "Tenant gateway admins delete wallbox instances" ON public.wallbox_modbus_instances;

CREATE POLICY "Tenant integrations admins insert wallbox instances"
  ON public.wallbox_modbus_instances FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_user_tenant_id()) AND has_permission(auth.uid(), 'integrations.edit'));

CREATE POLICY "Tenant integrations admins update wallbox instances"
  ON public.wallbox_modbus_instances FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id()) AND has_permission(auth.uid(), 'integrations.edit'));

CREATE POLICY "Tenant integrations admins delete wallbox instances"
  ON public.wallbox_modbus_instances FOR DELETE TO authenticated
  USING ((tenant_id = get_user_tenant_id()) AND has_permission(auth.uid(), 'integrations.edit'));
