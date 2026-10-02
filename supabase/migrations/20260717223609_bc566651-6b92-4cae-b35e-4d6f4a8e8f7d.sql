
CREATE POLICY "Authenticated can read loxone-master"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'loxone-master');

CREATE POLICY "Super admins can upload loxone-master"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'loxone-master' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update loxone-master"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'loxone-master' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete loxone-master"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'loxone-master' AND public.has_role(auth.uid(), 'super_admin'));
