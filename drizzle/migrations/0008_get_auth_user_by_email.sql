CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text FROM auth.users u
  WHERE lower(u.email) = lower(trim(_email)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text) TO service_role;