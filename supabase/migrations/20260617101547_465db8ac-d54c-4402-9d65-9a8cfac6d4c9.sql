ALTER TABLE public.charging_invoices
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_count integer NOT NULL DEFAULT 0;