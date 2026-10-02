
-- 1. Add partner purchase prices to module_prices
ALTER TABLE public.module_prices
  ADD COLUMN IF NOT EXISTS partner_price_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_industry_price_monthly numeric NOT NULL DEFAULT 0;

-- 2. Add commission percentage to partners
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS commission_pct numeric NOT NULL DEFAULT 20;

-- 3. Per-partner module sale prices (Verkaufspreis the partner sets for resale mode)
CREATE TABLE IF NOT EXISTS public.partner_module_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  sale_price_monthly numeric,
  sale_price_industry_monthly numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, module_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_module_prices TO authenticated;
GRANT ALL ON public.partner_module_prices TO service_role;

ALTER TABLE public.partner_module_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_module_prices_super_admin_all"
  ON public.partner_module_prices
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "partner_module_prices_member_select"
  ON public.partner_module_prices
  FOR SELECT
  TO authenticated
  USING (public.is_partner_member(auth.uid(), partner_id));

CREATE POLICY "partner_module_prices_admin_upsert"
  ON public.partner_module_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.is_partner_admin(auth.uid())
  );

CREATE POLICY "partner_module_prices_admin_update"
  ON public.partner_module_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.is_partner_admin(auth.uid())
  )
  WITH CHECK (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.is_partner_admin(auth.uid())
  );

CREATE TRIGGER trg_partner_module_prices_updated_at
  BEFORE UPDATE ON public.partner_module_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
