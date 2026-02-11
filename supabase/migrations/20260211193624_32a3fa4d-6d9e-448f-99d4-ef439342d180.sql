-- Allow super_admins to update user roles
CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admins to insert user roles
CREATE POLICY "Super admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admins to delete user roles
CREATE POLICY "Super admins can delete roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));