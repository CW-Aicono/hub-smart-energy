CREATE POLICY "Members read own community invoice PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'community-invoices'
  AND EXISTS (
    SELECT 1
    FROM public.community_member_invoices inv
    JOIN public.community_members cm ON cm.id = inv.member_id
    WHERE inv.pdf_path = storage.objects.name
      AND cm.email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
  )
);