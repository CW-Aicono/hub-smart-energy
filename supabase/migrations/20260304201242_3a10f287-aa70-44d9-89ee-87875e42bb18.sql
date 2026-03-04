-- Add Lexware Office contact ID to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS lexware_contact_id text;

-- Add Lexware Office invoice ID to tenant_invoices
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS lexware_invoice_id text;