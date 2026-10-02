CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = _user_id
        AND p.tenant_id = _tenant_id
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Tenant members insert documents" ON public.documents;
CREATE POLICY "Tenant members insert documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.is_tenant_member(auth.uid(), documents.tenant_id)
  )
  AND (
    documents.category_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.document_categories dc
      WHERE dc.id = documents.category_id
        AND dc.tenant_id = documents.tenant_id
    )
  )
);

DROP POLICY IF EXISTS "tenant-documents authenticated upload" ON storage.objects;
CREATE POLICY "tenant-documents authenticated upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-documents'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
  )
);

DROP POLICY IF EXISTS "tenant-documents tenant member read" ON storage.objects;
CREATE POLICY "tenant-documents tenant member read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tenant-documents'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
  )
);

DROP POLICY IF EXISTS "tenant-documents tenant admin manage" ON storage.objects;
CREATE POLICY "tenant-documents tenant admin manage"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-documents'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
    )
  )
);