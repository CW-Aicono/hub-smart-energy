DROP POLICY IF EXISTS "Members see own invoices" ON public.community_member_invoices;

CREATE POLICY "Members see own invoices"
ON public.community_member_invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.community_members cm
    WHERE cm.id = community_member_invoices.member_id
      AND cm.email = public.get_user_email()
  )
);