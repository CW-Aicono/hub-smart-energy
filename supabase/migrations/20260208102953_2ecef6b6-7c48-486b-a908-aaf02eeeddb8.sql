-- Bootstrap function to ensure at least one admin exists and every user has a role row.
-- This fixes cases where the initial user has no role and therefore cannot see admin UI.

CREATE OR REPLACE FUNCTION public.bootstrap_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_role public.app_role;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If current user already has a role, return it
  SELECT ur.role
    INTO existing_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF existing_role IS NOT NULL THEN
    RETURN existing_role;
  END IF;

  -- If no admin exists in the system, make this user the admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (auth.uid(), 'admin'::public.app_role);
    RETURN 'admin'::public.app_role;
  END IF;

  -- Otherwise assign default 'user'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'user'::public.app_role);

  RETURN 'user'::public.app_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_user_role() TO authenticated;