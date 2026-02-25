
-- Make buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('tenant-assets', 'floor-plans', 'floor-3d-models');

-- Drop any existing policies on storage.objects for these buckets to avoid conflicts
DROP POLICY IF EXISTS "Tenant assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Floor plans are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Floor 3D models are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_select" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_select" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_insert" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_update" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_delete" ON storage.objects;
DROP POLICY IF EXISTS "floor_3d_models_delete" ON storage.objects;

-- Helper: extract tenant_id folder prefix from storage path
-- Paths follow pattern: {tenant_id}/... or {location_id}/...

-- TENANT-ASSETS: path = {tenant_id}/logo.ext
-- SELECT: authenticated users can read assets belonging to their tenant
CREATE POLICY "tenant_assets_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid())
);

-- INSERT: authenticated users can upload to their tenant folder
CREATE POLICY "tenant_assets_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid())
);

-- UPDATE: authenticated users can update files in their tenant folder
CREATE POLICY "tenant_assets_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid())
);

-- DELETE: authenticated users can delete files in their tenant folder
CREATE POLICY "tenant_assets_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid())
);

-- FLOOR-PLANS: path = {location_id}/{floor_id}.ext
-- SELECT: user must have access to the location
CREATE POLICY "floor_plans_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

-- INSERT: user must belong to tenant that owns the location
CREATE POLICY "floor_plans_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'floor-plans'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

-- UPDATE
CREATE POLICY "floor_plans_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

-- DELETE
CREATE POLICY "floor_plans_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

-- FLOOR-3D-MODELS: same path pattern as floor-plans
CREATE POLICY "floor_3d_models_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "floor_3d_models_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'floor-3d-models'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "floor_3d_models_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "floor_3d_models_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'floor-3d-models'
  AND EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.profiles p ON p.tenant_id = l.tenant_id
    WHERE p.user_id = auth.uid()
      AND l.id::text = (storage.foldername(name))[1]
  )
);
