-- 1) Resolve historische Verbindungsfehler für Integrationen, deren letzter Sync erfolgreich war (≤ 30 Min)
UPDATE public.integration_errors ie
SET is_resolved = true,
    resolved_at = now(),
    updated_at = now()
FROM public.location_integrations li
WHERE ie.location_integration_id = li.id
  AND ie.is_resolved = false
  AND ie.error_type = 'connection'
  AND li.sync_status IN ('success', 'syncing')
  AND li.last_sync_at > now() - interval '30 minutes';

-- 2) Verknüpfte offene Tasks mit erledigen
UPDATE public.tasks t
SET status = 'done', completed_at = now()
FROM public.integration_errors ie
WHERE ie.task_id = t.id
  AND ie.is_resolved = true
  AND ie.resolved_at > now() - interval '5 minutes'
  AND t.status != 'done';

-- 3) Self-Healing-Trigger: wenn eine Integration auf 'success' wechselt, alle offenen
--    Connection-Fehler dieser Integration automatisch auflösen.
CREATE OR REPLACE FUNCTION public.auto_resolve_integration_errors_on_sync_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sync_status = 'success' AND COALESCE(OLD.sync_status, '') <> 'success' THEN
    UPDATE public.integration_errors
    SET is_resolved = true,
        resolved_at = now(),
        updated_at = now()
    WHERE location_integration_id = NEW.id
      AND is_resolved = false
      AND error_type = 'connection';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resolve_errors_on_sync_success ON public.location_integrations;
CREATE TRIGGER trg_auto_resolve_errors_on_sync_success
AFTER UPDATE OF sync_status ON public.location_integrations
FOR EACH ROW
EXECUTE FUNCTION public.auto_resolve_integration_errors_on_sync_success();