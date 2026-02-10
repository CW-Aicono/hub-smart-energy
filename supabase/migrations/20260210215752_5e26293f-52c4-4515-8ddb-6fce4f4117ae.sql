-- Prevent main meters from having a parent meter (DB-level enforcement)
CREATE OR REPLACE FUNCTION public.check_main_meter_no_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_main_meter = true AND NEW.parent_meter_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hauptzähler dürfen keinem übergeordneten Zähler zugeordnet werden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_main_meter_no_parent
  BEFORE INSERT OR UPDATE ON public.meters
  FOR EACH ROW
  EXECUTE FUNCTION public.check_main_meter_no_parent();