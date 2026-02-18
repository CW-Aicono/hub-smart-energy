
-- Create tasks table for tenant task management
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open', -- open, in_progress, done, cancelled
  priority text NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  assigned_to uuid, -- user_id of assignee (nullable = unassigned)
  assigned_to_name text, -- cached name for display
  external_contact_name text, -- for forwarding to external service providers
  external_contact_email text,
  external_contact_phone text,
  source_type text NOT NULL DEFAULT 'manual', -- manual, alert, charging, automation
  source_id text, -- reference id of the triggering event
  source_label text, -- human-readable label of the source
  due_date date,
  completed_at timestamp with time zone,
  created_by uuid,
  created_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policies: all tenant users can view tasks
CREATE POLICY "Users can view tasks in their tenant"
ON public.tasks
FOR SELECT
USING (tenant_id = get_user_tenant_id());

-- All tenant users can create tasks
CREATE POLICY "Users can create tasks in their tenant"
ON public.tasks
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id());

-- All tenant users can update tasks (collaborative)
CREATE POLICY "Users can update tasks in their tenant"
ON public.tasks
FOR UPDATE
USING (tenant_id = get_user_tenant_id());

-- Only admins can delete tasks
CREATE POLICY "Admins can delete tasks"
ON public.tasks
FOR DELETE
USING ((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
