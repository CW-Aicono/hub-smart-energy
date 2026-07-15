CREATE OR REPLACE FUNCTION public.is_document_category_in_tenant(_category_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _category_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.document_categories dc
      WHERE dc.id = _category_id
        AND dc.tenant_id = _tenant_id
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_document_category_in_tenant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_document_category_in_tenant(uuid, uuid) TO service_role;

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
    OR public.is_document_category_in_tenant(documents.category_id, documents.tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant members view categories" ON public.document_categories;
CREATE POLICY "Tenant members view categories"
ON public.document_categories
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.is_tenant_member(auth.uid(), document_categories.tenant_id)
);

DROP POLICY IF EXISTS "Admins manage categories" ON public.document_categories;
CREATE POLICY "Admins manage categories"
ON public.document_categories
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_tenant_member(auth.uid(), document_categories.tenant_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_tenant_member(auth.uid(), document_categories.tenant_id)
  )
);