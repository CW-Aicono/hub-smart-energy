
CREATE OR REPLACE FUNCTION public.notify_pending_ocpp_command()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'cp', NEW.charge_point_ocpp_id,
        'command', NEW.command,
        'id', NEW.id
      ),
      'new_command',
      'ocpp:commands',
      false
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the INSERT if broadcast fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pending_ocpp_command ON public.pending_ocpp_commands;
CREATE TRIGGER trg_notify_pending_ocpp_command
AFTER INSERT ON public.pending_ocpp_commands
FOR EACH ROW EXECUTE FUNCTION public.notify_pending_ocpp_command();
