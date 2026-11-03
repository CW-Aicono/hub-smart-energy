CREATE OR REPLACE FUNCTION public.can_read_price_catalog(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_portal_read(_uid,'commercial')
      OR public.has_role(_uid,'super_admin')
      OR public.has_role(_uid,'sales_partner')
      OR EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.user_id = _uid)
$$;
DROP POLICY IF EXISTS "catalog read" ON public.pricing_packages;
CREATE POLICY "catalog read" ON public.pricing_packages FOR SELECT TO authenticated USING (public.can_read_price_catalog(auth.uid()));
DROP POLICY IF EXISTS "catalog read" ON public.pricing_unit_prices;
CREATE POLICY "catalog read" ON public.pricing_unit_prices FOR SELECT TO authenticated USING (public.can_read_price_catalog(auth.uid()));