CREATE TABLE public.storage_soc_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id uuid NOT NULL REFERENCES public.energy_storages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  sensor_uuid text NOT NULL,
  soc_pct numeric NOT NULL CHECK (soc_pct >= 0 AND soc_pct <= 100),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'bridge',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.storage_soc_readings TO authenticated;
GRANT ALL ON public.storage_soc_readings TO service_role;

ALTER TABLE public.storage_soc_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can read own storage soc readings"
ON public.storage_soc_readings
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Partner members can read storage soc readings"
ON public.storage_soc_readings
FOR SELECT
TO authenticated
USING (public.partner_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Service role manages storage soc readings"
ON public.storage_soc_readings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_storage_soc_readings_storage_recorded
ON public.storage_soc_readings(storage_id, recorded_at DESC);

CREATE INDEX idx_storage_soc_readings_tenant_recorded
ON public.storage_soc_readings(tenant_id, recorded_at DESC);

CREATE INDEX idx_storage_soc_readings_sensor_recorded
ON public.storage_soc_readings(sensor_uuid, recorded_at DESC);