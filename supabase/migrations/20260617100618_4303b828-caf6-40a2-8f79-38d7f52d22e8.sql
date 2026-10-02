-- Add missing UPDATE and DELETE storage RLS policies for charging-invoice-assets bucket
-- so upsert: true on logo upload works (and admins can replace/remove the logo).

CREATE POLICY "Admins can update invoice assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'charging-invoice-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.tenant_id::text = split_part(objects.name, '/', 1)
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'charging-invoice-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.tenant_id::text = split_part(objects.name, '/', 1)
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Admins can delete invoice assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'charging-invoice-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.tenant_id::text = split_part(objects.name, '/', 1)
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);