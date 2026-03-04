
-- Function to create a linked task when an integration error is inserted
CREATE OR REPLACE FUNCTION public.create_task_for_integration_error()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task_id uuid;
  v_title text;
BEGIN
  -- Only create task for new unresolved errors
  IF NEW.is_resolved = true THEN
    RETURN NEW;
  END IF;

  -- Build title from sensor_name or error_message
  IF NEW.sensor_name IS NOT NULL THEN
    v_title := NEW.sensor_name || ': ' || NEW.error_message;
  ELSE
    v_title := NEW.error_message;
  END IF;

  -- Create the task
  INSERT INTO public.tasks (tenant_id, title, status, priority, source_type, source_label)
  VALUES (NEW.tenant_id, v_title, 'open', 'high', 'automation', 'Integrationsfehler')
  RETURNING id INTO v_task_id;

  -- Link task to error
  NEW.task_id := v_task_id;

  RETURN NEW;
END;
$$;

-- Trigger on INSERT
CREATE TRIGGER trg_create_task_for_integration_error
  BEFORE INSERT ON public.integration_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_for_integration_error();

-- Function to auto-complete linked task when error is resolved
CREATE OR REPLACE FUNCTION public.resolve_task_for_integration_error()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If error is being resolved and has a linked task
  IF NEW.is_resolved = true AND OLD.is_resolved = false AND NEW.task_id IS NOT NULL THEN
    UPDATE public.tasks
    SET status = 'done', completed_at = now()
    WHERE id = NEW.task_id AND status != 'done';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on UPDATE
CREATE TRIGGER trg_resolve_task_for_integration_error
  BEFORE UPDATE ON public.integration_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_task_for_integration_error();

-- Backfill: create tasks for existing unresolved errors without task_id
DO $$
DECLARE
  rec RECORD;
  v_task_id uuid;
  v_title text;
BEGIN
  FOR rec IN 
    SELECT id, tenant_id, sensor_name, error_message 
    FROM public.integration_errors 
    WHERE is_resolved = false AND task_id IS NULL
  LOOP
    IF rec.sensor_name IS NOT NULL THEN
      v_title := rec.sensor_name || ': ' || rec.error_message;
    ELSE
      v_title := rec.error_message;
    END IF;

    INSERT INTO public.tasks (tenant_id, title, status, priority, source_type, source_label)
    VALUES (rec.tenant_id, v_title, 'open', 'high', 'automation', 'Integrationsfehler')
    RETURNING id INTO v_task_id;

    UPDATE public.integration_errors SET task_id = v_task_id WHERE id = rec.id;
  END LOOP;
END;
$$;
