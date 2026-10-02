CREATE POLICY "Tenant users read own raw samples"
ON public.bridge_raw_samples
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());