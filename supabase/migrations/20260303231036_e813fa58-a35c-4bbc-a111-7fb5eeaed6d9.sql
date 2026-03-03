
-- Add payment method and SEPA fields to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'invoice';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sepa_iban text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sepa_bic text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sepa_mandate_ref text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sepa_mandate_date date;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sepa_account_holder text;
