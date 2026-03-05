
-- Add AICONO member flag to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_aicono_member boolean NOT NULL DEFAULT false;

-- Add standard_price column to module_prices (current price_monthly becomes the member price)
ALTER TABLE public.module_prices ADD COLUMN IF NOT EXISTS standard_price numeric NOT NULL DEFAULT 0;
