
-- Allow tenant electricity tenants to link themselves (update auth_user_id when it's null and email matches)
CREATE POLICY "App tenants can self-link by email"
ON public.tenant_electricity_tenants
FOR UPDATE
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND auth_user_id IS NULL
  AND status = 'active'
)
WITH CHECK (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND auth_user_id = auth.uid()
);
