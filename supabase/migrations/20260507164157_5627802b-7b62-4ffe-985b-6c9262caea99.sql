-- Phase 4: Remote- & Auto-Software-Updates

-- 1. Add update-related columns to gateway_devices
ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS auto_update_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS update_channel text NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS last_update_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_update_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_update_error text;

ALTER TABLE public.gateway_devices
  DROP CONSTRAINT IF EXISTS gateway_devices_update_channel_check;
ALTER TABLE public.gateway_devices
  ADD CONSTRAINT gateway_devices_update_channel_check
  CHECK (update_channel IN ('stable','beta','dev'));

-- 2. gateway_release_channels: published versions per channel
CREATE TABLE IF NOT EXISTS public.gateway_release_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('stable','beta','dev')),
  version text NOT NULL,
  image_ref text NOT NULL,
  release_notes text,
  is_latest boolean NOT NULL DEFAULT false,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, version)
);

CREATE INDEX IF NOT EXISTS gateway_release_channels_channel_latest_idx
  ON public.gateway_release_channels (channel) WHERE is_latest = true;

ALTER TABLE public.gateway_release_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read release channels" ON public.gateway_release_channels;
CREATE POLICY "Authenticated users can read release channels"
  ON public.gateway_release_channels FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins manage release channels" ON public.gateway_release_channels;
CREATE POLICY "Super admins manage release channels"
  ON public.gateway_release_channels FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_gateway_release_channels_updated_at
  BEFORE UPDATE ON public.gateway_release_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. gateway_update_jobs: per-gateway update orders
CREATE TABLE IF NOT EXISTS public.gateway_update_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_device_id uuid NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  target_version text NOT NULL,
  image_ref text NOT NULL,
  channel text NOT NULL DEFAULT 'stable',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','dispatched','running','success','failed','cancelled')),
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','auto','scheduled')),
  log_excerpt text,
  error_message text,
  dispatched_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_update_jobs_device_idx
  ON public.gateway_update_jobs (gateway_device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_update_jobs_tenant_idx
  ON public.gateway_update_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_update_jobs_status_idx
  ON public.gateway_update_jobs (status) WHERE status IN ('queued','dispatched','running');

ALTER TABLE public.gateway_update_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view their update jobs" ON public.gateway_update_jobs;
CREATE POLICY "Tenant members can view their update jobs"
  ON public.gateway_update_jobs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_user_tenant_id()
        AND public.has_permission(auth.uid(), 'gateway.manage'))
  );

DROP POLICY IF EXISTS "Super admins manage update jobs" ON public.gateway_update_jobs;
CREATE POLICY "Super admins manage update jobs"
  ON public.gateway_update_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_gateway_update_jobs_updated_at
  BEFORE UPDATE ON public.gateway_update_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_update_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_release_channels;