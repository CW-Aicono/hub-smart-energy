
-- Enums
DO $$ BEGIN CREATE TYPE public.payment_provider_type AS ENUM ('ccv','nayax','payter','adyen','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_provider_env AS ENUM ('sandbox','production'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_terminal_status AS ENUM ('unknown','online','offline','disabled','error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.adhoc_payment_state AS ENUM ('created','preauth_pending','preauth_ok','preauth_failed','charging','capture_pending','captured','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_event_direction AS ENUM ('inbound','outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ocpi_role AS ENUM ('CPO','EMSP','HUB'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) payment_providers
CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type public.payment_provider_type NOT NULL,
  display_name text NOT NULL,
  environment public.payment_provider_env NOT NULL DEFAULT 'sandbox',
  base_url text,
  party_id text,
  country_code text,
  credentials_secret_ref text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_providers_tenant ON public.payment_providers(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_read" ON public.payment_providers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));
CREATE POLICY "pp_write" ON public.payment_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')));

-- 2) payment_terminals
CREATE TABLE IF NOT EXISTS public.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.payment_providers(id) ON DELETE CASCADE,
  terminal_serial text NOT NULL,
  terminal_model text,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  connector_id integer,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status public.payment_terminal_status NOT NULL DEFAULT 'unknown',
  last_seen_at timestamptz,
  firmware text,
  brand_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, terminal_serial)
);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_tenant ON public.payment_terminals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_cp ON public.payment_terminals(charge_point_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_terminals TO authenticated;
GRANT ALL ON public.payment_terminals TO service_role;
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_read" ON public.payment_terminals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));
CREATE POLICY "pt_write" ON public.payment_terminals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')));

-- 3) adhoc_payment_sessions
CREATE TABLE IF NOT EXISTS public.adhoc_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  terminal_id uuid REFERENCES public.payment_terminals(id) ON DELETE SET NULL,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  connector_id integer,
  charging_session_id uuid REFERENCES public.charging_sessions(id) ON DELETE SET NULL,
  ocpp_transaction_id text,
  psp_reference text,
  preauth_amount_cents integer NOT NULL DEFAULT 0,
  captured_amount_cents integer NOT NULL DEFAULT 0,
  refunded_amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  card_brand text,
  card_last4 text,
  state public.adhoc_payment_state NOT NULL DEFAULT 'created',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adhoc_tenant ON public.adhoc_payment_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_adhoc_state ON public.adhoc_payment_sessions(state);
CREATE INDEX IF NOT EXISTS idx_adhoc_psp_ref ON public.adhoc_payment_sessions(psp_reference);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhoc_payment_sessions TO authenticated;
GRANT ALL ON public.adhoc_payment_sessions TO service_role;
ALTER TABLE public.adhoc_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aps_read" ON public.adhoc_payment_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));
CREATE POLICY "aps_refund" ON public.adhoc_payment_sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.refund')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.refund')));

-- 4) payment_events
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.adhoc_payment_sessions(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  direction public.payment_event_direction NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON public.payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_session ON public.payment_events(session_id);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pe_read" ON public.payment_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));

-- 5) ocpi_endpoints
CREATE TABLE IF NOT EXISTS public.ocpi_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.ocpi_role NOT NULL,
  party_id text NOT NULL,
  country_code text NOT NULL,
  base_url text NOT NULL,
  token_a text,
  token_b text,
  token_c text,
  version text NOT NULL DEFAULT '2.2.1',
  status text NOT NULL DEFAULT 'pending',
  last_registered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, party_id, country_code)
);
CREATE INDEX IF NOT EXISTS idx_ocpi_endpoints_tenant ON public.ocpi_endpoints(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocpi_endpoints TO authenticated;
GRANT ALL ON public.ocpi_endpoints TO service_role;
ALTER TABLE public.ocpi_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oe_read" ON public.ocpi_endpoints FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));
CREATE POLICY "oe_write" ON public.ocpi_endpoints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')));

-- 6) ocpi_tokens
CREATE TABLE IF NOT EXISTS public.ocpi_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.ocpi_endpoints(id) ON DELETE SET NULL,
  uid text NOT NULL,
  token_type text NOT NULL DEFAULT 'RFID',
  contract_id text,
  issuer text,
  valid boolean NOT NULL DEFAULT true,
  whitelist text NOT NULL DEFAULT 'ALLOWED',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, uid, token_type)
);
CREATE INDEX IF NOT EXISTS idx_ocpi_tokens_tenant ON public.ocpi_tokens(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocpi_tokens TO authenticated;
GRANT ALL ON public.ocpi_tokens TO service_role;
ALTER TABLE public.ocpi_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otk_read" ON public.ocpi_tokens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.view')));
CREATE POLICY "otk_write" ON public.ocpi_tokens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (tenant_id = public.get_user_tenant_id() AND public.has_permission(auth.uid(),'charging.payments.configure')));

-- updated_at triggers
DO $$ BEGIN CREATE TRIGGER trg_payment_providers_updated BEFORE UPDATE ON public.payment_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_payment_terminals_updated BEFORE UPDATE ON public.payment_terminals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_adhoc_sessions_updated BEFORE UPDATE ON public.adhoc_payment_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_ocpi_endpoints_updated BEFORE UPDATE ON public.ocpi_endpoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Permissions
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('charging.payments.view','Ad-Hoc Zahlungen anzeigen','Ad-Hoc Payment Konfiguration und Transaktionen anzeigen','charging'),
  ('charging.payments.configure','Ad-Hoc Zahlungen konfigurieren','PSP-Verbindungen und Terminals verwalten','charging'),
  ('charging.payments.refund','Ad-Hoc Zahlungen erstatten','Refunds anstoßen','charging')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin role by default
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::app_role, id FROM public.permissions WHERE code IN
  ('charging.payments.view','charging.payments.configure','charging.payments.refund')
ON CONFLICT DO NOTHING;

-- Module price entry
INSERT INTO public.module_prices (module_code, price_monthly)
VALUES ('adhoc_payment', 0)
ON CONFLICT (module_code) DO NOTHING;
