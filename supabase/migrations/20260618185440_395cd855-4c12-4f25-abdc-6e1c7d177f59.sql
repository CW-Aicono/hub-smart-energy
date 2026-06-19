CREATE POLICY "Super admins can view all location integrations"
ON public.location_integrations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));