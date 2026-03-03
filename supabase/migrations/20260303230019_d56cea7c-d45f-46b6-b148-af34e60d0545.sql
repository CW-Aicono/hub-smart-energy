
-- Add per-tenant support session pricing
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS support_price_per_15min numeric NOT NULL DEFAULT 25.00;

-- Insert default global module price for remote_support
INSERT INTO public.module_prices (module_code, price_monthly, updated_at)
VALUES ('remote_support', 49.00, now())
ON CONFLICT (module_code) DO NOTHING;
