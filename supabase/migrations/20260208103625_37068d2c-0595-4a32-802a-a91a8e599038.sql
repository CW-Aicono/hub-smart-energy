-- Ensure there is ALWAYS at least one admin in the system.
-- If no admin exists, the first authenticated user calling this function is promoted to admin.

CREATE OR REPLACE FUNCTION public.ensure_at_least_one_admin()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ur.role
    INTO current_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  -- If no admin exists at all, make the current user admin (update or insert)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role
  ) THEN
    IF current_role IS NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (auth.uid(), 'admin'::public.app_role);
    ELSE
      UPDATE public.user_roles
      SET role = 'admin'::public.app_role
      WHERE user_id = auth.uid();
    END IF;

    RETURN 'admin'::public.app_role;
  END IF;

  -- If the user has no role row yet, assign default 'user'
  IF current_role IS NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (auth.uid(), 'user'::public.app_role);

    RETURN 'user'::public.app_role;
  END IF;

  RETURN current_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_at_least_one_admin() TO authenticated;