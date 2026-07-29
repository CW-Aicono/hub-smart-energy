
CREATE TABLE public.meter_power_readings_5min_part (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meter_id uuid,
  tenant_id uuid NOT NULL,
  energy_type text NOT NULL,
  power_avg numeric NOT NULL,
  power_max numeric NOT NULL,
  bucket timestamptz NOT NULL,
  sample_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolution_minutes smallint NOT NULL DEFAULT 5,
  source text
) PARTITION BY RANGE (bucket);

DO $$
DECLARE
  d date := date '2026-02-01';
BEGIN
  WHILE d < date '2027-02-01' LOOP
    EXECUTE format(
      'CREATE TABLE public.meter_power_readings_5min_p_%s PARTITION OF public.meter_power_readings_5min_part FOR VALUES FROM (%L) TO (%L)',
      to_char(d, 'YYYYMM'), d, (d + interval '1 month')::date
    );
    d := (d + interval '1 month')::date;
  END LOOP;
END $$;

CREATE TABLE public.meter_power_readings_5min_p_default
  PARTITION OF public.meter_power_readings_5min_part DEFAULT;

CREATE UNIQUE INDEX meter_power_readings_5min_part_uniq
  ON public.meter_power_readings_5min_part (meter_id, bucket, resolution_minutes);

CREATE INDEX meter_power_readings_5min_part_tenant_bucket_idx
  ON public.meter_power_readings_5min_part (tenant_id, bucket DESC);

CREATE INDEX meter_power_readings_5min_part_meter_bucket_idx
  ON public.meter_power_readings_5min_part (meter_id, bucket DESC) INCLUDE (power_avg, power_max, resolution_minutes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_power_readings_5min_part TO authenticated;
GRANT ALL ON public.meter_power_readings_5min_part TO service_role;

ALTER TABLE public.meter_power_readings_5min_part ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view 5min readings"
  ON public.meter_power_readings_5min_part FOR SELECT
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Partner members can read tenant data"
  ON public.meter_power_readings_5min_part FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

CREATE POLICY "Tenant users can insert 5min readings"
  ON public.meter_power_readings_5min_part FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Tenant users can delete 5min readings"
  ON public.meter_power_readings_5min_part FOR DELETE
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
