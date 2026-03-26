-- Fix storage RLS: name-shadowing bug in floor-plans, floor-3d-models, meter-photos policies.
-- Also remove overly-permissive legacy 3D model policies.

-- 1) DROP all broken floor-plans policies
DROP POLICY IF EXISTS "floor_plans_select" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_insert" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_update" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_delete" ON storage.objects;

-- 2) DROP all broken floor-3d-models policies
DROP POLICY IF EXISTS "floor_3d_models_select" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_insert" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_update" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_delete" ON storage.objects;

-- 3) DROP legacy overly-permissive 3D model policies
DROP POLICY IF EXISTS "Authenticated users can upload 3D models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update 3D models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete 3D models" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for 3D models" ON storage.objects;

-- 4) DROP all broken meter-photos policies
DROP POLICY IF EXISTS "meter_photos_select_tenant" ON storage.objects;
DROP POLICY IF EXISTS "meter_photos_insert_tenant" ON storage.objects;
DROP POLICY IF EXISTS "meter_photos_update_tenant" ON storage.objects;
DROP POLICY IF EXISTS "meter_photos_delete_tenant" ON storage.objects;

-- RECREATE: floor-plans (path = {location_id}/{file})
CREATE POLICY "floor_plans_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_plans_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'floor-plans'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_plans_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_plans_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

-- RECREATE: floor-3d-models (path = {location_id}/{file})
CREATE POLICY "floor_3d_models_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_3d_models_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'floor-3d-models'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_3d_models_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "floor_3d_models_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND split_part(name, '/', 1) IN (
    SELECT l.id::text FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

-- RECREATE: meter-photos (path = {meter_id}/{file})
CREATE POLICY "meter_photos_select_tenant" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) IN (
    SELECT m.id::text FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "meter_photos_insert_tenant" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) IN (
    SELECT m.id::text FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "meter_photos_update_tenant" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) IN (
    SELECT m.id::text FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "meter_photos_delete_tenant" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) IN (
    SELECT m.id::text FROM public.meters m
    JOIN public.profiles p ON p.tenant_id = m.tenant_id
    WHERE p.user_id = auth.uid()
  )
);