
-- Fix overly permissive policy: restrict write access to super admins only
DROP POLICY "Service role can manage charger models" ON public.charger_models;

-- Super admins (checked via user_roles table) can manage charger models
CREATE POLICY "Super admins can insert charger models"
  ON public.charger_models FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can update charger models"
  ON public.charger_models FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can delete charger models"
  ON public.charger_models FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
