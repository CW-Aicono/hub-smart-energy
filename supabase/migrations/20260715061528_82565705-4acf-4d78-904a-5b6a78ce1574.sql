
CREATE OR REPLACE FUNCTION public.sync_shared_custom_widget()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_shared = true THEN
    INSERT INTO public.dashboard_widgets (user_id, widget_type, position, is_visible, widget_size, config)
    SELECT p.id,
           'custom_' || NEW.id::text,
           COALESCE((SELECT MAX(position) FROM public.dashboard_widgets dw WHERE dw.user_id = p.id), 0) + 1,
           true,
           'full',
           '{}'::jsonb
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.tenant_id = NEW.tenant_id
      AND NOT EXISTS (
        SELECT 1 FROM public.dashboard_widgets dw
        WHERE dw.user_id = p.id
          AND dw.widget_type = 'custom_' || NEW.id::text
      );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_shared = true AND NEW.is_shared = false THEN
    DELETE FROM public.dashboard_widgets
    WHERE widget_type = 'custom_' || NEW.id::text
      AND user_id <> NEW.created_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_shared_custom_widget ON public.custom_widget_definitions;
CREATE TRIGGER trg_sync_shared_custom_widget
AFTER INSERT OR UPDATE OF is_shared ON public.custom_widget_definitions
FOR EACH ROW
EXECUTE FUNCTION public.sync_shared_custom_widget();

INSERT INTO public.dashboard_widgets (user_id, widget_type, position, is_visible, widget_size, config)
SELECT p.id,
       'custom_' || cwd.id::text,
       COALESCE((SELECT MAX(position) FROM public.dashboard_widgets dw WHERE dw.user_id = p.id), 0) + 1,
       true,
       'full',
       '{}'::jsonb
FROM public.custom_widget_definitions cwd
JOIN public.profiles p ON p.tenant_id = cwd.tenant_id
JOIN auth.users u ON u.id = p.id
WHERE cwd.is_shared = true
  AND NOT EXISTS (
    SELECT 1 FROM public.dashboard_widgets dw
    WHERE dw.user_id = p.id
      AND dw.widget_type = 'custom_' || cwd.id::text
  );
