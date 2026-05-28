
CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_user_email() TO authenticated, anon;

DROP POLICY IF EXISTS "Members see own membership by email" ON public.community_members;
DROP POLICY IF EXISTS "Members update own onboarding fields" ON public.community_members;

CREATE POLICY "Members see own membership by email"
ON public.community_members
FOR SELECT
USING (email = public.get_user_email());

CREATE POLICY "Members update own onboarding fields"
ON public.community_members
FOR UPDATE
USING (email = public.get_user_email())
WITH CHECK (email = public.get_user_email());
