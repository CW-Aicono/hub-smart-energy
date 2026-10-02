DROP POLICY IF EXISTS "Authenticated users can read connectors" ON public.charge_point_connectors;

CREATE POLICY "Tenant users can read own connectors"
ON public.charge_point_connectors
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.charge_points cp
    WHERE cp.id = charge_point_connectors.charge_point_id
      AND cp.tenant_id = public.get_user_tenant_id()
  )
);