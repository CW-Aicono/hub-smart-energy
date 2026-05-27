
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invite_sent_at TIMESTAMPTZ;

ALTER TABLE public.community_members
  ALTER COLUMN status SET DEFAULT 'invited';

CREATE OR REPLACE FUNCTION public.member_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'invited' AND NEW.invited_at IS NULL THEN
      NEW.invited_at := now();
    END IF;
    IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN
      NEW.activated_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'invited' AND NEW.invited_at IS NULL THEN
      NEW.invited_at := now();
    END IF;
    IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN
      NEW.activated_at := now();
    END IF;
    IF NEW.status = 'suspended' THEN
      NEW.suspended_at := now();
    END IF;
    IF NEW.status = 'left' AND NEW.left_at IS NULL THEN
      NEW.left_at := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_status_timestamps ON public.community_members;
CREATE TRIGGER trg_member_status_timestamps
BEFORE INSERT OR UPDATE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.member_status_timestamps();
