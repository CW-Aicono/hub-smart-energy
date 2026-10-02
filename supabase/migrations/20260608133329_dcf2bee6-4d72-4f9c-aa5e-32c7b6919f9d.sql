
CREATE POLICY "Super admins upload firmware"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cp-firmware' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins update firmware"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cp-firmware' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins delete firmware"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cp-firmware' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated read firmware metadata"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cp-firmware');
