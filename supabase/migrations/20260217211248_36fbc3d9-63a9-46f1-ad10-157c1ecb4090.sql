
-- Remove the dangerous policy that allows admins to see ALL profiles across ALL tenants
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create correct policy: admins only see profiles within their own tenant
CREATE POLICY "Admins can view profiles in their tenant"
  ON public.profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND tenant_id = get_user_tenant_id()
    )
    OR is_own_profile(user_id)
  );
