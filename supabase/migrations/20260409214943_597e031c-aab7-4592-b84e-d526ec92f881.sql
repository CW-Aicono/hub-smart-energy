
-- 1. charging_tariffs: add tax_rate_percent
ALTER TABLE public.charging_tariffs
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric NOT NULL DEFAULT 19;

-- 2. charging_user_groups: add tariff_id
ALTER TABLE public.charging_user_groups
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES public.charging_tariffs(id) ON DELETE SET NULL;

-- 3. charging_users: add tariff_id
ALTER TABLE public.charging_users
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES public.charging_tariffs(id) ON DELETE SET NULL;

-- 4. charging_invoices: make session_id nullable, add new columns
ALTER TABLE public.charging_invoices
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.charging_invoices
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.charging_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS invoice_date date NOT NULL DEFAULT CURRENT_DATE;

-- 5. charging_invoice_sessions (n:m)
CREATE TABLE IF NOT EXISTS public.charging_invoice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.charging_invoices(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.charging_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, session_id)
);

ALTER TABLE public.charging_invoice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice_sessions of their tenant"
  ON public.charging_invoice_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.charging_invoices ci
    WHERE ci.id = invoice_id
      AND ci.tenant_id = public.get_user_tenant_id()
  ));

CREATE POLICY "Authenticated users can insert invoice_sessions for their tenant"
  ON public.charging_invoice_sessions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.charging_invoices ci
    WHERE ci.id = invoice_id
      AND ci.tenant_id = public.get_user_tenant_id()
  ));

-- 6. charging_invoice_counter
CREATE TABLE IF NOT EXISTS public.charging_invoice_counter (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE public.charging_invoice_counter ENABLE ROW LEVEL SECURITY;
-- No direct access policies — only via the DB function

-- 7. Atomic invoice number function
CREATE OR REPLACE FUNCTION public.next_charging_invoice_number(p_tenant_id uuid, p_year integer)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO public.charging_invoice_counter (tenant_id, year, last_number)
  VALUES (p_tenant_id, p_year, 1)
  ON CONFLICT (tenant_id, year)
  DO UPDATE SET last_number = charging_invoice_counter.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'EV-' || p_year::text || '-' || lpad(v_next::text, 4, '0');
END;
$$;
