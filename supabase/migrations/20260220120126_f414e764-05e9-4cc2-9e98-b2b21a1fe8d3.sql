
-- Allow service role to insert spot prices (edge function uses service role key)
CREATE POLICY "Service role can insert spot prices" ON public.spot_prices FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can delete spot prices" ON public.spot_prices FOR DELETE USING (true);
