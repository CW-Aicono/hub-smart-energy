-- Allow super admins to view all meters across tenants
CREATE POLICY "Super admins can view all meters"
  ON public.meters
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
