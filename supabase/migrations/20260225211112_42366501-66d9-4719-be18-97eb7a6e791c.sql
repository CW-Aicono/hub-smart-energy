
-- 1. invite_tokens: Only admins can SELECT, only service_role can INSERT/UPDATE/DELETE
-- (Edge functions use service_role for token creation/verification)

CREATE POLICY "Admins can view invite tokens"
ON public.invite_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages invite tokens"
ON public.invite_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. spot_prices: Fix overly permissive policies - restrict to service_role

DROP POLICY "Service role can insert spot prices" ON public.spot_prices;
DROP POLICY "Service role can delete spot prices" ON public.spot_prices;

CREATE POLICY "Service role can insert spot prices"
ON public.spot_prices
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete spot prices"
ON public.spot_prices
FOR DELETE
TO service_role
USING (true);
