CREATE POLICY "Members see own membership by email"
ON public.community_members
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
);

CREATE POLICY "Members see own readings"
ON public.community_member_readings_15min
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.id = community_member_readings_15min.member_id
      AND cm.email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
  )
);

CREATE POLICY "Members update own onboarding fields"
ON public.community_members
FOR UPDATE
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
)
WITH CHECK (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
);