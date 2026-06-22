CREATE TABLE public.meter_loxone_daily_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  energy_total_kwh NUMERIC(18,3),
  energy_today_kwh NUMERIC(18,3),
  source TEXT NOT NULL DEFAULT 'loxone_http_poll',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meter_id, snapshot_date)
);

CREATE INDEX idx_mlds_tenant_date ON public.meter_loxone_daily_snapshots (tenant_id, snapshot_date DESC);
CREATE INDEX idx_mlds_meter_date  ON public.meter_loxone_daily_snapshots (meter_id, snapshot_date DESC);

GRANT SELECT ON public.meter_loxone_daily_snapshots TO authenticated;
GRANT ALL    ON public.meter_loxone_daily_snapshots TO service_role;

ALTER TABLE public.meter_loxone_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read own snapshots"
  ON public.meter_loxone_daily_snapshots
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Super admins manage all snapshots"
  ON public.meter_loxone_daily_snapshots
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_mlds_updated_at
  BEFORE UPDATE ON public.meter_loxone_daily_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();