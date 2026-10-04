-- Echte Kontosperre: profiles.is_blocked wird mit auth.users.banned_until synchronisiert
-- und darf nur von Super-Admins bzw. Tenant-Admins (eigener Mandant) geaendert werden.
CREATE OR REPLACE FUNCTION public.sync_profile_block_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NEW.is_blocked IS NOT DISTINCT FROM OLD.is_blocked THEN
    RETURN NEW;
  END IF;

  -- Service-Role / Systemkontext (kein JWT-User) darf immer
  IF _uid IS NOT NULL THEN
    IF NOT (
      public.has_role(_uid, 'super_admin'::app_role)
      OR (public.has_role(_uid, 'admin'::app_role) AND NEW.tenant_id IS NOT NULL AND NEW.tenant_id = public.get_user_tenant_id())
    ) THEN
      RAISE EXCEPTION 'Keine Berechtigung, den Sperrstatus zu aendern' USING ERRCODE = '42501';
    END IF;
    IF _uid = NEW.user_id AND NEW.is_blocked THEN
      RAISE EXCEPTION 'Das eigene Konto kann nicht gesperrt werden' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE auth.users
     SET banned_until = CASE WHEN NEW.is_blocked THEN 'infinity'::timestamptz ELSE NULL END
   WHERE id = NEW.user_id;

  IF NEW.is_blocked THEN
    DELETE FROM auth.sessions WHERE user_id = NEW.user_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = NEW.user_id::text;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_block_to_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_profile_block_to_auth ON public.profiles;
CREATE TRIGGER trg_sync_profile_block_to_auth
BEFORE UPDATE OF is_blocked ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_block_to_auth();

-- Bestehende Sperren nachziehen
UPDATE auth.users u
   SET banned_until = 'infinity'::timestamptz
  FROM public.profiles p
 WHERE p.user_id = u.id AND p.is_blocked = true
   AND (u.banned_until IS NULL OR u.banned_until < now());
DELETE FROM auth.sessions s USING public.profiles p
 WHERE p.user_id = s.user_id AND p.is_blocked = true;
