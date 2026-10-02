
-- ============================================================
-- OCPP Firmware Update: Datenmodell
-- ============================================================

-- 1) Artefakt-Katalog (global, super_admin-only writes)
CREATE TABLE public.cp_firmware_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  model text NOT NULL,
  version text NOT NULL,
  storage_path text NOT NULL,            -- Pfad im Bucket 'cp-firmware'
  file_size bigint,
  sha256 text,
  file_format text NOT NULL DEFAULT 'bin', -- bin | zip | fwu | tar | other
  is_eichrecht_certified boolean NOT NULL DEFAULT false,
  eichrecht_approval_ref text,           -- Hinweis/Link auf Konformitätsbescheinigung
  release_notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, model, version)
);

GRANT SELECT ON public.cp_firmware_artifacts TO authenticated;
GRANT ALL ON public.cp_firmware_artifacts TO service_role;

ALTER TABLE public.cp_firmware_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read firmware catalog"
  ON public.cp_firmware_artifacts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Only super admins can insert firmware artifacts"
  ON public.cp_firmware_artifacts FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admins can update firmware artifacts"
  ON public.cp_firmware_artifacts FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admins can delete firmware artifacts"
  ON public.cp_firmware_artifacts FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));


-- 2) Firmware-Jobs (tenant-scoped via charge_point)
CREATE TABLE public.cp_firmware_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES public.cp_firmware_artifacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
    -- queued | dispatched | downloading | downloaded
    -- | installing | installed | failed | cancelled
  retrieve_date timestamptz NOT NULL,
  retries integer,
  retry_interval integer,
  download_url text,
  url_expires_at timestamptz,
  last_status_at timestamptz,
  error_code text,
  error_message text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_firmware_jobs_cp_idx ON public.cp_firmware_jobs (charge_point_id, created_at DESC);
CREATE INDEX cp_firmware_jobs_tenant_idx ON public.cp_firmware_jobs (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cp_firmware_jobs TO authenticated;
GRANT ALL ON public.cp_firmware_jobs TO service_role;

ALTER TABLE public.cp_firmware_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can read firmware jobs"
  ON public.cp_firmware_jobs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Tenant users can insert firmware jobs"
  ON public.cp_firmware_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Tenant users can update firmware jobs"
  ON public.cp_firmware_jobs FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Tenant users can delete firmware jobs"
  ON public.cp_firmware_jobs FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );


-- 3) Status-Events (Audit-Log)
CREATE TABLE public.cp_firmware_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.cp_firmware_jobs(id) ON DELETE SET NULL,
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  status text NOT NULL,
  raw_payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_firmware_status_events_job_idx ON public.cp_firmware_status_events (job_id, received_at DESC);
CREATE INDEX cp_firmware_status_events_cp_idx ON public.cp_firmware_status_events (charge_point_id, received_at DESC);

GRANT SELECT ON public.cp_firmware_status_events TO authenticated;
GRANT ALL ON public.cp_firmware_status_events TO service_role;

ALTER TABLE public.cp_firmware_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can read firmware status events"
  ON public.cp_firmware_status_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- Inserts: nur service_role (OCPP-Server via Edge-Function).


-- 4) updated_at trigger
CREATE TRIGGER cp_firmware_artifacts_set_updated_at
  BEFORE UPDATE ON public.cp_firmware_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER cp_firmware_jobs_set_updated_at
  BEFORE UPDATE ON public.cp_firmware_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 5) Realtime aktivieren für Live-Statusverlauf in der UI
ALTER PUBLICATION supabase_realtime ADD TABLE public.cp_firmware_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cp_firmware_status_events;
