CREATE POLICY "Users can update own tenant integration errors"
ON public.integration_errors
FOR UPDATE
TO authenticated
USING (tenant_id = get_user_tenant_id())
WITH CHECK (tenant_id = get_user_tenant_id());