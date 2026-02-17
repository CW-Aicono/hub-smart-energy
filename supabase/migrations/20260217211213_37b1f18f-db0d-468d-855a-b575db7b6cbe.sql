
-- Drop all existing DELETE policies on profiles first
DROP POLICY IF EXISTS "Admins can delete profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;

-- Recreate unified DELETE policy
CREATE POLICY "Profiles delete policy"
  ON public.profiles
  FOR DELETE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND tenant_id = get_user_tenant_id()
    )
    OR is_own_profile(user_id)
  );

-- Drop existing UPDATE policies and recreate with tenant scope
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Profiles update policy"
  ON public.profiles
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND tenant_id = get_user_tenant_id()
    )
    OR is_own_profile(user_id)
  );
