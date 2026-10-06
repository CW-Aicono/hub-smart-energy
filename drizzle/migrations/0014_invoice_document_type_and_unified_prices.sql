ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'invoice';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_invoices_document_type_check') THEN
    ALTER TABLE public.tenant_invoices ADD CONSTRAINT tenant_invoices_document_type_check CHECK (document_type IN ('invoice','subscription_notice'));
  END IF;
END $$;
UPDATE public.tenant_invoices SET document_type = 'subscription_notice'
  WHERE coalesce(amount,0) <= 0 AND lexware_invoice_id IS NULL AND status = 'draft' AND document_type = 'invoice';
COMMENT ON COLUMN public.module_prices.price_monthly IS 'DEPRECATED: AICONO e.V. price, replaced by standard_price';
COMMENT ON COLUMN public.module_prices.industry_price_monthly IS 'DEPRECATED: unified pricing uses standard_price';
COMMENT ON COLUMN public.module_prices.industry_standard_price IS 'DEPRECATED: unified pricing uses standard_price';
COMMENT ON COLUMN public.module_prices.partner_industry_price_monthly IS 'DEPRECATED: unified pricing uses partner_price_monthly';
COMMENT ON COLUMN public.module_prices.charge_point_price_monthly IS 'DEPRECATED: replaced by standard_charge_point_price_monthly';
COMMENT ON COLUMN public.module_prices.industry_charge_point_price_monthly IS 'DEPRECATED: unified pricing';
COMMENT ON COLUMN public.module_prices.industry_standard_charge_point_price_monthly IS 'DEPRECATED: unified pricing';
COMMENT ON COLUMN public.module_prices.partner_industry_charge_point_price_monthly IS 'DEPRECATED: unified pricing';