
-- 1) Tasks: new columns
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON public.tasks(tenant_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_parent ON public.tasks(recurrence_parent_id);

-- 2) Tenants: cleanup settings
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS task_auto_archive_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS task_auto_delete_days int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS task_protect_external boolean NOT NULL DEFAULT true;

-- 3) Task templates table
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  default_due_offset_days int,
  recurrence_rule text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view task templates"
  ON public.task_templates FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins manage task templates"
  ON public.task_templates FOR ALL TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
      AND public.has_role(auth.uid(), 'admin'))
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
      AND public.has_role(auth.uid(), 'admin'))
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER trg_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Recurrence trigger: create next instance when a recurring task is completed
CREATE OR REPLACE FUNCTION public.tasks_handle_recurrence_on_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule text;
  v_unit text;
  v_interval int;
  v_base date;
  v_next date;
  v_root uuid;
  v_exists boolean;
BEGIN
  IF NEW.status <> 'done' OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;
  v_rule := COALESCE(NEW.recurrence_rule, '');
  IF v_rule = '' THEN
    RETURN NEW;
  END IF;

  -- Expected format: "daily:1" | "weekly:2" | "monthly:1"
  v_unit := split_part(v_rule, ':', 1);
  v_interval := COALESCE(NULLIF(split_part(v_rule, ':', 2), '')::int, 1);
  IF v_interval < 1 THEN v_interval := 1; END IF;

  v_base := COALESCE(NEW.due_date, CURRENT_DATE);
  v_next := CASE v_unit
    WHEN 'daily'   THEN v_base + (v_interval || ' days')::interval
    WHEN 'weekly'  THEN v_base + (v_interval || ' weeks')::interval
    WHEN 'monthly' THEN v_base + (v_interval || ' months')::interval
    ELSE NULL
  END;
  IF v_next IS NULL THEN RETURN NEW; END IF;

  v_root := COALESCE(NEW.recurrence_parent_id, NEW.id);

  -- Avoid duplicate creation if the trigger fires twice for the same date
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE recurrence_parent_id = v_root
      AND due_date = v_next
      AND status IN ('open','in_progress')
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  INSERT INTO public.tasks (
    tenant_id, title, description, status, priority,
    assigned_to, assigned_to_name,
    external_contact_name, external_contact_email, external_contact_phone,
    source_type, source_id, source_label,
    due_date, created_by, created_by_name,
    recurrence_rule, recurrence_parent_id, checklist
  ) VALUES (
    NEW.tenant_id, NEW.title, NEW.description, 'open', NEW.priority,
    NEW.assigned_to, NEW.assigned_to_name,
    NEW.external_contact_name, NEW.external_contact_email, NEW.external_contact_phone,
    NEW.source_type, NEW.source_id, NEW.source_label,
    v_next, NEW.created_by, NEW.created_by_name,
    NEW.recurrence_rule, v_root,
    -- Reset checklist done-flags for the new instance
    COALESCE((
      SELECT jsonb_agg(jsonb_set(item, '{done}', 'false'::jsonb))
      FROM jsonb_array_elements(NEW.checklist) AS item
    ), '[]'::jsonb)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_recurrence_on_done ON public.tasks;
CREATE TRIGGER trg_tasks_recurrence_on_done
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_handle_recurrence_on_done();
