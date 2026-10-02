
-- Allow tenant members to manage charge-point photos stored under
-- 'charge-points/{charge_point_id}.{ext}' in the meter-photos bucket.

CREATE POLICY "charge_point_photos_select_tenant"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND split_part(split_part(name, '/', 2), '.', 1) IN (
    SELECT cp.id::text
    FROM public.charge_points cp
    JOIN public.profiles p ON p.tenant_id = cp.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "charge_point_photos_insert_tenant"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND split_part(split_part(name, '/', 2), '.', 1) IN (
    SELECT cp.id::text
    FROM public.charge_points cp
    JOIN public.profiles p ON p.tenant_id = cp.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "charge_point_photos_update_tenant"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND split_part(split_part(name, '/', 2), '.', 1) IN (
    SELECT cp.id::text
    FROM public.charge_points cp
    JOIN public.profiles p ON p.tenant_id = cp.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "charge_point_photos_delete_tenant"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND split_part(split_part(name, '/', 2), '.', 1) IN (
    SELECT cp.id::text
    FROM public.charge_points cp
    JOIN public.profiles p ON p.tenant_id = cp.tenant_id
    WHERE p.user_id = auth.uid()
  )
);
