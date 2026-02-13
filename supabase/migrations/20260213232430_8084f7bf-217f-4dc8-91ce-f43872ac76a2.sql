
-- Add idle fee fields to charging_tariffs
ALTER TABLE public.charging_tariffs ADD COLUMN IF NOT EXISTS idle_fee_per_minute numeric NOT NULL DEFAULT 0;
ALTER TABLE public.charging_tariffs ADD COLUMN IF NOT EXISTS idle_fee_grace_minutes integer NOT NULL DEFAULT 60;

-- Add idle fee amount to charging_invoices
ALTER TABLE public.charging_invoices ADD COLUMN IF NOT EXISTS idle_fee_amount numeric NOT NULL DEFAULT 0;
