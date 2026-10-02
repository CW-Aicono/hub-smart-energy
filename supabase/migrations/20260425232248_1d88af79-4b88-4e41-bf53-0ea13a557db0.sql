
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS connection_protocol text NOT NULL DEFAULT 'wss'
    CHECK (connection_protocol IN ('ws','wss')),
  ADD COLUMN IF NOT EXISTS auth_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS certificate_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_type text;

CREATE OR REPLACE FUNCTION public.charge_points_clear_password_when_no_auth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_required = false THEN
    NEW.ocpp_password := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_points_clear_password ON public.charge_points;
CREATE TRIGGER trg_charge_points_clear_password
BEFORE INSERT OR UPDATE ON public.charge_points
FOR EACH ROW
EXECUTE FUNCTION public.charge_points_clear_password_when_no_auth();
