
CREATE OR REPLACE FUNCTION public.email_exists_anywhere(_email text)
RETURNS TABLE(exists_flag boolean, context text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_user_id uuid;
BEGIN
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'super_admin') THEN
      RETURN QUERY SELECT true, 'super_admin'::text; RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.partner_members WHERE user_id = v_user_id) THEN
      RETURN QUERY SELECT true, 'partner'::text; RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id AND tenant_id IS NOT NULL) THEN
      RETURN QUERY SELECT true, 'tenant'::text; RETURN;
    END IF;
    RETURN QUERY SELECT true, 'auth'::text; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_invitations WHERE lower(email) = v_email AND accepted_at IS NULL) THEN
    RETURN QUERY SELECT true, 'invitation'::text; RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.email_exists_anywhere(text) FROM public;
GRANT EXECUTE ON FUNCTION public.email_exists_anywhere(text) TO authenticated, service_role;
