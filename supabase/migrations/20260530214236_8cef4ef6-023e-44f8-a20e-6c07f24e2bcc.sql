CREATE POLICY "Super admins can view all charge points" ON public.charge_points FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charge point connectors" ON public.charge_point_connectors FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charge point groups" ON public.charge_point_groups FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charging users" ON public.charging_users FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charging user groups" ON public.charging_user_groups FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charging tariffs" ON public.charging_tariffs FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charging invoices" ON public.charging_invoices FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can view all charger models" ON public.charger_models FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));