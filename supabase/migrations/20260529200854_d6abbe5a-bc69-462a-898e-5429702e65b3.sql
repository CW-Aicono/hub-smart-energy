CREATE OR REPLACE FUNCTION public.can_manage_tenant_asset_path(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id IS NOT NULL
        AND p.tenant_id::text = split_part(_object_name, '/', 1)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_charge_point_photo_path(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  SELECT
    split_part(_object_name, '/', 1) = 'charge-points'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.charge_points cp
        JOIN public.profiles p ON p.tenant_id = cp.tenant_id
        WHERE p.user_id = auth.uid()
          AND cp.id::text = split_part(split_part(_object_name, '/', 2), '.', 1)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_tenant_asset_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_charge_point_photo_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_tenant_asset_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_charge_point_photo_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can upload tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete tenant assets" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;

CREATE POLICY "tenant_assets_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND public.can_manage_tenant_asset_path(name)
);

CREATE POLICY "tenant_assets_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.can_manage_tenant_asset_path(name)
)
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND public.can_manage_tenant_asset_path(name)
);

CREATE POLICY "tenant_assets_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.can_manage_tenant_asset_path(name)
);

DROP POLICY IF EXISTS "charge_point_photos_insert_tenant" ON storage.objects;
DROP POLICY IF EXISTS "charge_point_photos_update_tenant" ON storage.objects;
DROP POLICY IF EXISTS "charge_point_photos_delete_tenant" ON storage.objects;

CREATE POLICY "charge_point_photos_insert_tenant"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meter-photos'
  AND public.can_manage_charge_point_photo_path(name)
);

CREATE POLICY "charge_point_photos_update_tenant"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND public.can_manage_charge_point_photo_path(name)
)
WITH CHECK (
  bucket_id = 'meter-photos'
  AND public.can_manage_charge_point_photo_path(name)
);

CREATE POLICY "charge_point_photos_delete_tenant"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND public.can_manage_charge_point_photo_path(name)
);