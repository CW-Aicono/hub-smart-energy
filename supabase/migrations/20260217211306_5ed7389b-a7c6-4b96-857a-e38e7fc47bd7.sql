
-- Fix user_roles SELECT: admins should only see roles of users in their tenant
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view roles in their tenant"
  ON public.user_roles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (auth.uid() = user_id)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
          AND p.tenant_id = get_user_tenant_id()
      )
    )
  );

-- Fix user_roles DELETE: admins should only delete roles in their tenant
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can delete roles in their tenant"
  ON public.user_roles
  FOR DELETE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
          AND p.tenant_id = get_user_tenant_id()
      )
    )
  );

-- Fix user_roles UPDATE: admins should only update roles in their tenant
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins can update roles in their tenant"
  ON public.user_roles
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
          AND p.tenant_id = get_user_tenant_id()
      )
    )
  );

-- Fix user_invitations: admins should only manage invitations in their tenant
-- (user_invitations has no tenant_id, so this is trickier - we keep it as-is since
-- invitations are tenant-scoped via the invite flow logic)
