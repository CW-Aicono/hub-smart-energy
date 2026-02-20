
-- Create a security definer function to get the current user's email
CREATE OR REPLACE FUNCTION public.get_auth_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid()
$$;

-- Drop the old policy that directly accesses auth.users
DROP POLICY IF EXISTS "App tenants can self-link by email" ON public.tenant_electricity_tenants;

-- Recreate using the security definer function
CREATE POLICY "App tenants can self-link by email"
ON public.tenant_electricity_tenants
FOR UPDATE
USING (
  email = get_auth_user_email()
  AND auth_user_id IS NULL
  AND status = 'active'
)
WITH CHECK (
  email = get_auth_user_email()
  AND auth_user_id = auth.uid()
);
