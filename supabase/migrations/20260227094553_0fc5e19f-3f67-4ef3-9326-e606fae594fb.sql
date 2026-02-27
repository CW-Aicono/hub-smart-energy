
-- Add structured address and contact_person fields to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS house_number text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_person text;
