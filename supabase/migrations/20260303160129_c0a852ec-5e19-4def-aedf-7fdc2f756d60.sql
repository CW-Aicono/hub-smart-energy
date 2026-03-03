
-- Drop existing overly permissive meter-photos policies
DROP POLICY IF EXISTS "Authenticated users can view meter photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload meter photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update meter photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete meter photos" ON storage.objects;

-- Tenant-scoped SELECT: user can only view photos of meters belonging to their tenant
CREATE POLICY "meter_photos_select_tenant"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND EXISTS (
    SELECT 1 FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
      AND m.id::text = (storage.foldername(name))[1]
  )
);

-- Tenant-scoped INSERT
CREATE POLICY "meter_photos_insert_tenant"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'meter-photos'
  AND EXISTS (
    SELECT 1 FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
      AND m.id::text = (storage.foldername(name))[1]
  )
);

-- Tenant-scoped UPDATE
CREATE POLICY "meter_photos_update_tenant"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND EXISTS (
    SELECT 1 FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
      AND m.id::text = (storage.foldername(name))[1]
  )
);

-- Tenant-scoped DELETE
CREATE POLICY "meter_photos_delete_tenant"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND EXISTS (
    SELECT 1 FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
      AND m.id::text = (storage.foldername(name))[1]
  )
);
