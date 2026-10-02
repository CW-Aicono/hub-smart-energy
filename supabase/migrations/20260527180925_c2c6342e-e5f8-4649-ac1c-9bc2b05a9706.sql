
-- 1) Erweiterung meter_power_readings_5min
ALTER TABLE public.meter_power_readings_5min
  ADD COLUMN IF NOT EXISTS resolution_minutes smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.meter_power_readings_5min
  ADD CONSTRAINT meter_power_readings_5min_resolution_check
  CHECK (resolution_minutes IN (5, 15));

-- alten Unique-Index ersetzen, damit 5- und 15-Min-Werte nebeneinander existieren
DROP INDEX IF EXISTS public.meter_power_readings_5min_meter_bucket_idx;
CREATE UNIQUE INDEX meter_power_readings_5min_meter_bucket_res_idx
  ON public.meter_power_readings_5min (meter_id, bucket, resolution_minutes);

-- 2) Erweiterung meters um Smart-Meter-/iMSys-Kennungen
ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS melo_id text,
  ADD COLUMN IF NOT EXISTS malo_id text,
  ADD COLUMN IF NOT EXISTS smgw_id text,
  ADD COLUMN IF NOT EXISTS obis_code text;

CREATE INDEX IF NOT EXISTS idx_meters_melo_id ON public.meters (tenant_id, melo_id) WHERE melo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meters_malo_id ON public.meters (tenant_id, malo_id) WHERE malo_id IS NOT NULL;

-- 3) MSCONS-Import-Audit
CREATE TABLE public.smart_meter_mscons_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  uploaded_by uuid,
  file_name text NOT NULL,
  file_hash text NOT NULL,
  file_size_bytes integer,
  status text NOT NULL DEFAULT 'pending',
  rows_imported integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, file_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_meter_mscons_imports TO authenticated;
GRANT ALL ON public.smart_meter_mscons_imports TO service_role;

ALTER TABLE public.smart_meter_mscons_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view mscons imports"
  ON public.smart_meter_mscons_imports FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users insert mscons imports"
  ON public.smart_meter_mscons_imports FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users update mscons imports"
  ON public.smart_meter_mscons_imports FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users delete mscons imports"
  ON public.smart_meter_mscons_imports FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_smart_meter_mscons_imports_updated_at
  BEFORE UPDATE ON public.smart_meter_mscons_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) MsbG §50 Einwilligungen
CREATE TABLE public.smart_meter_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  meter_id uuid REFERENCES public.meters(id) ON DELETE CASCADE,
  consent_scope text NOT NULL,
  consent_text_version text,
  granted_by uuid,
  granted_by_email text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_meter_consents TO authenticated;
GRANT ALL ON public.smart_meter_consents TO service_role;

ALTER TABLE public.smart_meter_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view consents"
  ON public.smart_meter_consents FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users insert consents"
  ON public.smart_meter_consents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users update consents"
  ON public.smart_meter_consents FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users delete consents"
  ON public.smart_meter_consents FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_smart_meter_consents_updated_at
  BEFORE UPDATE ON public.smart_meter_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_smart_meter_consents_tenant ON public.smart_meter_consents (tenant_id, location_id);
CREATE INDEX idx_smart_meter_consents_meter ON public.smart_meter_consents (meter_id) WHERE meter_id IS NOT NULL;
