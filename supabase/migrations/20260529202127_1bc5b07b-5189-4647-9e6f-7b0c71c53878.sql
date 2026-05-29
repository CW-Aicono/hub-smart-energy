-- 1) Alte/fehleranfällige Policies & Hilfsfunktionen entfernen
DROP POLICY IF EXISTS "tenant_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete tenant assets" ON storage.objects;

DROP POLICY IF EXISTS "charge_point_photos_insert_tenant" ON storage.objects;
DROP POLICY IF EXISTS "charge_point_photos_update_tenant" ON storage.objects;
DROP POLICY IF EXISTS "charge_point_photos_delete_tenant" ON storage.objects;
DROP POLICY IF EXISTS "charge_point_photos_select_tenant" ON storage.objects;

DROP FUNCTION IF EXISTS public.can_manage_tenant_asset_path(text);
DROP FUNCTION IF EXISTS public.can_manage_charge_point_photo_path(text);

-- 2) TENANT-ASSETS (Pfad: {tenant_id}/...)
-- SELECT: angemeldete Tenant-Mitglieder + super_admin
CREATE POLICY "tenant_assets_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(name, '/', 1) IN (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
    )
  )
);

CREATE POLICY "tenant_assets_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(name, '/', 1) IN (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
    )
  )
);

CREATE POLICY "tenant_assets_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(name, '/', 1) IN (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
    )
  )
)
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(name, '/', 1) IN (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
    )
  )
);

CREATE POLICY "tenant_assets_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(name, '/', 1) IN (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
    )
  )
);

-- 3) CHARGE-POINT-PHOTOS in meter-photos (Pfad: charge-points/{cp_id}.{ext})
CREATE POLICY "charge_point_photos_select_tenant" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(split_part(name, '/', 2), '.', 1) IN (
      SELECT cp.id::text
      FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "charge_point_photos_insert_tenant" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(split_part(name, '/', 2), '.', 1) IN (
      SELECT cp.id::text
      FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "charge_point_photos_update_tenant" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(split_part(name, '/', 2), '.', 1) IN (
      SELECT cp.id::text
      FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE p.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(split_part(name, '/', 2), '.', 1) IN (
      SELECT cp.id::text
      FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "charge_point_photos_delete_tenant" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND split_part(name, '/', 1) = 'charge-points'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR split_part(split_part(name, '/', 2), '.', 1) IN (
      SELECT cp.id::text
      FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE p.user_id = auth.uid()
    )
  )
);