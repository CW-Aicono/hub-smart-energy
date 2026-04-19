-- Add public access token + signer info to sales_quotes
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_email text,
  ADD COLUMN IF NOT EXISTS signer_ip text,
  ADD COLUMN IF NOT EXISTS signer_user_agent text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

-- Backfill tokens for existing rows
UPDATE public.sales_quotes
  SET public_token = encode(gen_random_bytes(24), 'hex')
  WHERE public_token IS NULL;

-- Public read policy via token (used by edge function only, but allow anon SELECT by token)
DROP POLICY IF EXISTS "Public can view quote by token" ON public.sales_quotes;
CREATE POLICY "Public can view quote by token"
  ON public.sales_quotes
  FOR SELECT
  TO anon
  USING (public_token IS NOT NULL);

-- Audit log for quote views/signatures
CREATE TABLE IF NOT EXISTS public.sales_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('viewed','signed','rejected','reminder_sent')),
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_quote_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner can view own quote events" ON public.sales_quote_events;
CREATE POLICY "Partner can view own quote events"
  ON public.sales_quote_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_quotes q
      JOIN public.sales_projects p ON p.id = q.project_id
      WHERE q.id = sales_quote_events.quote_id
        AND (p.partner_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role))
    )
  );

CREATE INDEX IF NOT EXISTS idx_sales_quote_events_quote ON public.sales_quote_events(quote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_token ON public.sales_quotes(public_token);