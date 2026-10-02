
-- 1. ocpp_meter_samples
CREATE TABLE public.ocpp_meter_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id integer NOT NULL DEFAULT 1,
  transaction_id integer,
  measurand text NOT NULL,
  phase text,
  unit text,
  value double precision NOT NULL,
  context text,
  sampled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ocpp_meter_samples_cp_time ON public.ocpp_meter_samples (charge_point_id, sampled_at DESC);
CREATE INDEX idx_ocpp_meter_samples_tenant_time ON public.ocpp_meter_samples (tenant_id, sampled_at DESC);
CREATE INDEX idx_ocpp_meter_samples_measurand ON public.ocpp_meter_samples (charge_point_id, measurand, sampled_at DESC);

GRANT SELECT ON public.ocpp_meter_samples TO authenticated;
GRANT ALL ON public.ocpp_meter_samples TO service_role;

ALTER TABLE public.ocpp_meter_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view own ocpp meter samples"
ON public.ocpp_meter_samples FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- 2. charge_point_capabilities
CREATE TABLE public.charge_point_capabilities (
  charge_point_id uuid PRIMARY KEY REFERENCES public.charge_points(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  supported_measurands text[] NOT NULL DEFAULT '{}',
  max_sample_length integer,
  min_sample_interval integer,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_probed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.charge_point_capabilities TO authenticated;
GRANT ALL ON public.charge_point_capabilities TO service_role;

ALTER TABLE public.charge_point_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view own cp capabilities"
ON public.charge_point_capabilities FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE TRIGGER tg_charge_point_capabilities_updated_at
BEFORE UPDATE ON public.charge_point_capabilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. charge_points.linked_meter_id (optional EMS-Verknüpfung)
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS linked_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_charge_points_linked_meter ON public.charge_points(linked_meter_id);

-- 4. Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE public.ocpp_meter_samples;
ALTER TABLE public.ocpp_meter_samples REPLICA IDENTITY FULL;
