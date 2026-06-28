
ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS sim_min numeric,
  ADD COLUMN IF NOT EXISTS sim_max numeric,
  ADD COLUMN IF NOT EXISTS sim_step numeric,
  ADD COLUMN IF NOT EXISTS sim_default_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sim_unit text,
  ADD COLUMN IF NOT EXISTS sim_bidirectional boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.simulation_meter_state (
  meter_id uuid PRIMARY KEY REFERENCES public.meters(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_value numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_simulation_meter_state_tenant
  ON public.simulation_meter_state(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_meter_state TO authenticated;
GRANT ALL ON public.simulation_meter_state TO service_role;

ALTER TABLE public.simulation_meter_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sim_state_select_tenant" ON public.simulation_meter_state;
CREATE POLICY "sim_state_select_tenant"
  ON public.simulation_meter_state
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "sim_state_insert_tenant" ON public.simulation_meter_state;
CREATE POLICY "sim_state_insert_tenant"
  ON public.simulation_meter_state
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "sim_state_update_tenant" ON public.simulation_meter_state;
CREATE POLICY "sim_state_update_tenant"
  ON public.simulation_meter_state
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "sim_state_delete_tenant" ON public.simulation_meter_state;
CREATE POLICY "sim_state_delete_tenant"
  ON public.simulation_meter_state
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

ALTER TABLE public.simulation_meter_state REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'simulation_meter_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.simulation_meter_state';
  END IF;
END $$;
