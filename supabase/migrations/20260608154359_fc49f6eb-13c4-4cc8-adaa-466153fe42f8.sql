ALTER TABLE public.charging_invoices
  ADD COLUMN IF NOT EXISTS billing_group_id uuid NULL
  REFERENCES public.charging_billing_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_charging_invoices_billing_group
  ON public.charging_invoices(billing_group_id)
  WHERE billing_group_id IS NOT NULL;