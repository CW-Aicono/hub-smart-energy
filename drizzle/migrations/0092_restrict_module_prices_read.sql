DROP POLICY IF EXISTS "Authenticated users can view module prices" ON public.module_prices;
DROP POLICY IF EXISTS "price_catalog_readers_select" ON public.module_prices;
CREATE POLICY "price_catalog_readers_select" ON public.module_prices
  FOR SELECT TO authenticated
  USING (public.can_read_price_catalog(auth.uid()));