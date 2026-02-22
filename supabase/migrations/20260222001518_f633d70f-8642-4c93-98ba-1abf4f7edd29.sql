
CREATE POLICY "App tenants can find own record by email for linking"
ON public.tenant_electricity_tenants
FOR SELECT
TO authenticated
USING (
  email = public.get_auth_user_email()
  AND auth_user_id IS NULL
  AND status = 'active'
);
