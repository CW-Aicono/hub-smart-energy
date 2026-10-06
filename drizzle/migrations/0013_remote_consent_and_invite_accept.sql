CREATE OR REPLACE FUNCTION public.end_support_sessions_on_remote_disable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF COALESCE(OLD.remote_support_enabled,false) = true AND COALESCE(NEW.remote_support_enabled,false) = false THEN
    DELETE FROM auth.refresh_tokens rt USING public.support_sessions s
      WHERE s.tenant_id = NEW.id AND s.ended_at IS NULL AND s.impersonated_user_id IS NOT NULL
        AND rt.user_id::text = s.impersonated_user_id::text;
    DELETE FROM auth.sessions se USING public.support_sessions s
      WHERE s.tenant_id = NEW.id AND s.ended_at IS NULL AND se.user_id = s.impersonated_user_id;
    UPDATE public.support_sessions SET ended_at = now()
      WHERE tenant_id = NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_end_support_sessions_on_remote_disable ON public.tenants;
CREATE TRIGGER trg_end_support_sessions_on_remote_disable AFTER UPDATE OF remote_support_enabled ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.end_support_sessions_on_remote_disable();

CREATE OR REPLACE FUNCTION public.accept_own_invitations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.user_invitations i SET accepted_at = now()
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND i.accepted_at IS NULL
    AND i.tenant_id = p.tenant_id AND lower(i.email) = lower(p.email);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.accept_own_invitations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_own_invitations() TO authenticated;

UPDATE public.user_invitations i SET accepted_at = COALESCE(u.last_sign_in_at, now())
FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
WHERE i.accepted_at IS NULL AND i.tenant_id = p.tenant_id
  AND lower(i.email) = lower(p.email) AND u.last_sign_in_at IS NOT NULL;