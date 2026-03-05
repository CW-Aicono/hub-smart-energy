
-- 1) Create automation_execution_log table
CREATE TABLE public.automation_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.location_automations(id) ON DELETE CASCADE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  trigger_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'success',
  error_message text,
  actions_executed jsonb DEFAULT '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant execution logs"
  ON public.automation_execution_log FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert own tenant execution logs"
  ON public.automation_execution_log FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE INDEX idx_exec_log_automation ON public.automation_execution_log(automation_id);
CREATE INDEX idx_exec_log_tenant ON public.automation_execution_log(tenant_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_execution_log;

-- 2) Extend location_automations with MLA columns
ALTER TABLE public.location_automations
  ADD COLUMN scope_type text NOT NULL DEFAULT 'location',
  ADD COLUMN scope_floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  ADD COLUMN scope_room_id uuid REFERENCES public.floor_rooms(id) ON DELETE SET NULL,
  ADD COLUMN target_location_ids uuid[] DEFAULT '{}',
  ADD COLUMN category text DEFAULT 'custom',
  ADD COLUMN color text,
  ADD COLUMN estimated_savings_kwh numeric,
  ADD COLUMN tags text[] DEFAULT '{}',
  ADD COLUMN scene_id uuid,
  ADD COLUMN notify_on_error boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_email text;

-- 3) Create automation_scenes table
CREATE TABLE public.automation_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'Layers',
  color text,
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant scenes"
  ON public.automation_scenes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage own tenant scenes"
  ON public.automation_scenes FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Add FK from location_automations.scene_id to scenes
ALTER TABLE public.location_automations
  ADD CONSTRAINT location_automations_scene_id_fkey
  FOREIGN KEY (scene_id) REFERENCES public.automation_scenes(id) ON DELETE SET NULL;
