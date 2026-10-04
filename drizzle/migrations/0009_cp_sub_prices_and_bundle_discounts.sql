ALTER TABLE public.module_prices
  ADD COLUMN IF NOT EXISTS partner_charge_point_price_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_industry_charge_point_price_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_charge_point_price_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS industry_standard_charge_point_price_monthly numeric NOT NULL DEFAULT 0;

-- Bisher galt ein Ladepunktpreis für alle Kunden -> als Standardpreis übernehmen
UPDATE public.module_prices
   SET standard_charge_point_price_monthly = charge_point_price_monthly
 WHERE standard_charge_point_price_monthly = 0 AND charge_point_price_monthly > 0;
UPDATE public.module_prices
   SET industry_standard_charge_point_price_monthly = industry_charge_point_price_monthly
 WHERE industry_standard_charge_point_price_monthly = 0 AND industry_charge_point_price_monthly > 0;

-- Ladepunktpreis gibt es nur noch als Unterpunkt von Ladeinfrastruktur
UPDATE public.module_prices
   SET charge_point_price_monthly = 0, industry_charge_point_price_monthly = 0,
       standard_charge_point_price_monthly = 0, industry_standard_charge_point_price_monthly = 0,
       partner_charge_point_price_monthly = 0, partner_industry_charge_point_price_monthly = 0
 WHERE module_code <> 'ev_charging'
   AND (charge_point_price_monthly <> 0 OR industry_charge_point_price_monthly <> 0
        OR standard_charge_point_price_monthly <> 0 OR industry_standard_charge_point_price_monthly <> 0);
UPDATE public.tenant_modules SET charge_point_price_override = NULL
 WHERE module_code <> 'ev_charging' AND charge_point_price_override IS NOT NULL;

ALTER TABLE public.tenant_module_discounts
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.module_bundles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS duration_value integer,
  ADD COLUMN IF NOT EXISTS duration_unit text,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS one_time_amount numeric,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmd_target') THEN
    ALTER TABLE public.tenant_module_discounts ADD CONSTRAINT tmd_target CHECK (NOT (module_code IS NOT NULL AND bundle_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmd_duration_unit') THEN
    ALTER TABLE public.tenant_module_discounts ADD CONSTRAINT tmd_duration_unit CHECK (duration_unit IS NULL OR duration_unit IN ('month','year'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmd_payment_mode') THEN
    ALTER TABLE public.tenant_module_discounts ADD CONSTRAINT tmd_payment_mode CHECK (
      payment_mode IN ('monthly','prepaid','one_time')
      AND (payment_mode = 'monthly' OR valid_until IS NOT NULL)
      AND (payment_mode <> 'one_time' OR one_time_amount > 0));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tmd_bundle ON public.tenant_module_discounts(bundle_id);

-- Partner/Tenant dürfen gebuchte Bundles ihrer Mandanten lesen (tenant_bundles-RLS greift im Subselect)
DROP POLICY IF EXISTS "Read bundles booked by accessible tenants" ON public.module_bundles;
CREATE POLICY "Read bundles booked by accessible tenants" ON public.module_bundles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_bundles tb WHERE tb.bundle_id = module_bundles.id));
DROP POLICY IF EXISTS "Read items of bundles booked by accessible tenants" ON public.module_bundle_items;
CREATE POLICY "Read items of bundles booked by accessible tenants" ON public.module_bundle_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_bundles tb WHERE tb.bundle_id = module_bundle_items.bundle_id));
GRANT SELECT ON public.module_bundles, public.module_bundle_items TO authenticated;