-- Roaming for Charging Infrastructure (generic baseline)

CREATE TABLE public.roaming_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'CPO' CHECK (role IN ('CPO','EMSP','HUB')),
  protocol text NOT NULL DEFAULT 'OCPI' CHECK (protocol IN ('OCPI','HUBJECT','OTHER')),
  country_code text,
  party_id text,
  our_token text,
  default_guest_tariff_id uuid REFERENCES public.charging_tariffs(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roaming_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roaming_settings select" ON public.roaming_settings FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_settings insert" ON public.roaming_settings FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_settings update" ON public.roaming_settings FOR UPDATE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_settings delete" ON public.roaming_settings FOR DELETE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER trg_roaming_settings_updated_at BEFORE UPDATE ON public.roaming_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.roaming_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'CPO' CHECK (role IN ('CPO','EMSP','HUB')),
  protocol text NOT NULL DEFAULT 'OCPI' CHECK (protocol IN ('OCPI','HUBJECT','OTHER')),
  country_code text,
  party_id text,
  endpoint_url text,
  token text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','error')),
  last_sync_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_roaming_partners_tenant ON public.roaming_partners(tenant_id);
ALTER TABLE public.roaming_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roaming_partners select" ON public.roaming_partners FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_partners insert" ON public.roaming_partners FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_partners update" ON public.roaming_partners FOR UPDATE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_partners delete" ON public.roaming_partners FOR DELETE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER trg_roaming_partners_updated_at BEFORE UPDATE ON public.roaming_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.roaming_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.roaming_partners(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  external_session_id text,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  external_user_ref text,
  started_at timestamptz,
  ended_at timestamptz,
  energy_kwh numeric(12,3) DEFAULT 0,
  cost_amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_roaming_sessions_tenant ON public.roaming_sessions(tenant_id);
CREATE INDEX idx_roaming_sessions_partner ON public.roaming_sessions(partner_id);
CREATE INDEX idx_roaming_sessions_started ON public.roaming_sessions(started_at DESC);
ALTER TABLE public.roaming_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roaming_sessions select" ON public.roaming_sessions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_sessions insert" ON public.roaming_sessions FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_sessions update" ON public.roaming_sessions FOR UPDATE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "roaming_sessions delete" ON public.roaming_sessions FOR DELETE
  USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'::app_role)) OR public.has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER trg_roaming_sessions_updated_at BEFORE UPDATE ON public.roaming_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
