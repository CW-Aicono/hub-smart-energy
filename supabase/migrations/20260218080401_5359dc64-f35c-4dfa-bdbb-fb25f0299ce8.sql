
-- Task history / audit log table
CREATE TABLE public.task_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  actor_id uuid NULL,
  actor_name text NULL,
  action text NOT NULL, -- 'created', 'status_changed', 'assigned', 'transferred', 'comment', 'deleted'
  old_value text NULL,
  new_value text NULL,
  comment text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task history in their tenant"
  ON public.task_history FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert task history in their tenant"
  ON public.task_history FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Index for fast lookup
CREATE INDEX idx_task_history_task_id ON public.task_history(task_id);
CREATE INDEX idx_task_history_tenant_id ON public.task_history(tenant_id);
