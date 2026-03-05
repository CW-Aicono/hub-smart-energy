
-- Add industry price columns to module_prices
ALTER TABLE public.module_prices
  ADD COLUMN IF NOT EXISTS industry_price_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS industry_standard_price numeric NOT NULL DEFAULT 0;

-- Add is_kommune flag to tenants (default true since current tenants are assumed Kommunen)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_kommune boolean NOT NULL DEFAULT true;
