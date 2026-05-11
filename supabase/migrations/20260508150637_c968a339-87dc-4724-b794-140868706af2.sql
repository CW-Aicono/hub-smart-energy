DROP POLICY IF EXISTS "Super admins can delete charger models" ON public.charger_models;
DROP POLICY IF EXISTS "Super admins can insert charger models" ON public.charger_models;
DROP POLICY IF EXISTS "Super admins can update charger models" ON public.charger_models;

CREATE POLICY "Super admins can delete charger models" ON public.charger_models
  FOR DELETE USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can insert charger models" ON public.charger_models
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins can update charger models" ON public.charger_models
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));