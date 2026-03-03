
-- Add line_items JSON column to store breakdown (modules + support sessions)
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;

-- Add module_total and support_total for quick reference
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS module_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS support_total numeric NOT NULL DEFAULT 0;
