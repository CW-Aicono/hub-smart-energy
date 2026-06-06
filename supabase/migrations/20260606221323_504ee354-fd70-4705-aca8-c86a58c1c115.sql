
CREATE TABLE public.location_dlm_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  reference_meter_id uuid,
  grid_limit_kw numeric NOT NULL,
  safety_buffer_kw numeric NOT NULL DEFAULT 2.0,
  fallback_kw_per_cp numeric NOT NULL DEFAULT 4.2,
  control_interval_s integer NOT NULL DEFAULT 30,
  min_charge_kw numeric NOT NULL DEFAULT 1.4,
  is_active boolean NOT NULL DEFAULT true,
  priority_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_location_dlm_config_tenant ON public.location_dlm_config(tenant_id);
CREATE INDEX idx_location_dlm_config_active ON public.location_dlm_config(is_active) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_dlm_config TO authenticated;
GRANT ALL ON public.location_dlm_config TO service_role;

ALTER TABLE public.location_dlm_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view dlm config"
  ON public.location_dlm_config FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Tenant admins can modify dlm config"
  ON public.location_dlm_config FOR ALL TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_location_dlm_config_updated_at
  BEFORE UPDATE ON public.location_dlm_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------

CREATE TABLE public.dlm_control_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  measured_kw numeric,
  available_kw numeric,
  applied_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text
);

CREATE INDEX idx_dlm_control_log_loc_time ON public.dlm_control_log(location_id, executed_at DESC);
CREATE INDEX idx_dlm_control_log_tenant_time ON public.dlm_control_log(tenant_id, executed_at DESC);

GRANT SELECT ON public.dlm_control_log TO authenticated;
GRANT ALL ON public.dlm_control_log TO service_role;

ALTER TABLE public.dlm_control_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view dlm log"
  ON public.dlm_control_log FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.location_dlm_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dlm_control_log;

ALTER TABLE public.location_dlm_config REPLICA IDENTITY FULL;
ALTER TABLE public.dlm_control_log REPLICA IDENTITY FULL;
