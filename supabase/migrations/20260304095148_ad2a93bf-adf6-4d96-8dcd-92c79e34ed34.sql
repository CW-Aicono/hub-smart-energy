
-- Table to store integration errors with auto-resolve
CREATE TABLE public.integration_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  location_integration_id uuid REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  integration_type text NOT NULL,
  error_type text NOT NULL DEFAULT 'connection',
  error_message text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups of active errors
CREATE INDEX idx_integration_errors_active ON public.integration_errors (tenant_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX idx_integration_errors_location ON public.integration_errors (location_id, is_resolved) WHERE is_resolved = false;

-- Enable RLS
ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;

-- Policy: users can read errors for their tenant
CREATE POLICY "Users can view own tenant integration errors"
ON public.integration_errors
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

-- Policy: service role can insert/update (via edge functions)
CREATE POLICY "Service role full access on integration_errors"
ON public.integration_errors
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_errors;
