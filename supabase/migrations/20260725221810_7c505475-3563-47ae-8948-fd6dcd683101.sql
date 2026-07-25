
-- =========================================================
-- 1) charge_point_terminals: n:m Terminal <-> Ladepunkt
-- =========================================================
CREATE TABLE public.charge_point_terminals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  terminal_id UUID NOT NULL REFERENCES public.payment_terminals(id) ON DELETE CASCADE,
  charge_point_id UUID NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id INTEGER,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (terminal_id, charge_point_id, connector_id)
);
CREATE INDEX idx_cpt_terminal ON public.charge_point_terminals(terminal_id);
CREATE INDEX idx_cpt_cp ON public.charge_point_terminals(charge_point_id);
CREATE INDEX idx_cpt_tenant ON public.charge_point_terminals(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_point_terminals TO authenticated;
GRANT ALL ON public.charge_point_terminals TO service_role;

ALTER TABLE public.charge_point_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpt_read" ON public.charge_point_terminals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.view'))
  );

CREATE POLICY "cpt_write" ON public.charge_point_terminals FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.configure'))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.configure'))
  );

CREATE TRIGGER trg_cpt_updated BEFORE UPDATE ON public.charge_point_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) adhoc_payment_rules: Regeln pro Scope
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.adhoc_rule_scope AS ENUM ('tenant', 'group', 'charge_point');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.adhoc_payment_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope public.adhoc_rule_scope NOT NULL,
  scope_id UUID,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tariff_id UUID REFERENCES public.charging_tariffs(id) ON DELETE SET NULL,
  preauth_amount_cents INTEGER NOT NULL DEFAULT 5000,
  preauth_expiry_minutes INTEGER NOT NULL DEFAULT 30,
  max_kwh NUMERIC,
  max_minutes INTEGER,
  min_amount_cents INTEGER NOT NULL DEFAULT 50,
  currency TEXT NOT NULL DEFAULT 'EUR',
  rounding_step_cents INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- scope integrity
  CONSTRAINT adhoc_rule_scope_ck CHECK (
    (scope = 'tenant' AND scope_id IS NULL) OR
    (scope IN ('group','charge_point') AND scope_id IS NOT NULL)
  )
);
CREATE INDEX idx_adhoc_rules_tenant ON public.adhoc_payment_rules(tenant_id);
CREATE INDEX idx_adhoc_rules_scope ON public.adhoc_payment_rules(scope, scope_id);
CREATE UNIQUE INDEX idx_adhoc_rules_tenant_unique
  ON public.adhoc_payment_rules(tenant_id) WHERE scope = 'tenant';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhoc_payment_rules TO authenticated;
GRANT ALL ON public.adhoc_payment_rules TO service_role;

ALTER TABLE public.adhoc_payment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apr_read" ON public.adhoc_payment_rules FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.view'))
  );

CREATE POLICY "apr_write" ON public.adhoc_payment_rules FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.configure'))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(), 'charging.payments.configure'))
  );

CREATE TRIGGER trg_apr_updated BEFORE UPDATE ON public.adhoc_payment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) Rechnungsnummern-Zähler für Ad-Hoc pro Tenant
-- =========================================================
CREATE TABLE public.adhoc_invoice_counter (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.adhoc_invoice_counter TO authenticated;
GRANT ALL ON public.adhoc_invoice_counter TO service_role;

ALTER TABLE public.adhoc_invoice_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aic_read" ON public.adhoc_invoice_counter FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    tenant_id = public.get_user_tenant_id()
  );

CREATE OR REPLACE FUNCTION public.next_adhoc_invoice_number(_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  cur_num INTEGER;
BEGIN
  INSERT INTO public.adhoc_invoice_counter (tenant_id, year, next_number)
  VALUES (_tenant_id, cur_year, 2)
  ON CONFLICT (tenant_id) DO UPDATE
    SET next_number = CASE
      WHEN public.adhoc_invoice_counter.year = cur_year THEN public.adhoc_invoice_counter.next_number + 1
      ELSE 2
    END,
    year = cur_year,
    updated_at = now()
  RETURNING (next_number - 1) INTO cur_num;

  RETURN 'AH-' || cur_year::TEXT || '-' || LPAD(cur_num::TEXT, 6, '0');
END $$;

-- =========================================================
-- 4) Erweiterung adhoc_payment_sessions
-- =========================================================
ALTER TABLE public.adhoc_payment_sessions
  ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES public.adhoc_payment_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tariff_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS energy_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_adhoc_sessions_invoice_number
  ON public.adhoc_payment_sessions(tenant_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
