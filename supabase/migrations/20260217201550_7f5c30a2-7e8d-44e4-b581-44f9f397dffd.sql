
-- Ensure profiles are deleted when auth user is deleted (CASCADE)
-- This allows admin deletion via auth.admin.deleteUser()
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_id_fkey,
  ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
  ADD CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add DELETE policy for profiles so admins can delete users in their tenant
-- (needed for the edge function which uses service role, but also for direct calls)
DROP POLICY IF EXISTS "Admins can delete profiles in their tenant" ON public.profiles;
CREATE POLICY "Admins can delete profiles in their tenant"
  ON public.profiles
  FOR DELETE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      tenant_id = get_user_tenant_id()
      AND has_role(auth.uid(), 'admin'::app_role)
    )
  );
