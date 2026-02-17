
-- Fix overly permissive ALL policy on module_prices
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.module_prices;

-- Super admins can manage prices, authenticated users can read
CREATE POLICY "Super admins can manage module prices"
  ON public.module_prices
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view module prices"
  ON public.module_prices
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
