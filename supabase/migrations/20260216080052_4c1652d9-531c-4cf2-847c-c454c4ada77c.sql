
-- Table to store periodic power readings for time-series charts
CREATE TABLE public.meter_power_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  power_value NUMERIC NOT NULL,
  energy_type TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient time-series queries by meter and time
CREATE INDEX idx_meter_power_readings_meter_time ON public.meter_power_readings(meter_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.meter_power_readings ENABLE ROW LEVEL SECURITY;

-- Tenant-based access policy
CREATE POLICY "Tenant users can manage power readings"
  ON public.meter_power_readings
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- Allow service role full access (for edge function inserts)
CREATE POLICY "Service role full access on power readings"
  ON public.meter_power_readings
  FOR ALL USING (true)
  WITH CHECK (true);
