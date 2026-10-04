-- Idempotent: invoice-files bucket scoped to the caller's tenant folder (<tenant_id>/...).
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their invoice files" ON storage.objects;
DROP POLICY IF EXISTS "invoice_files_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "invoice_files_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_files_tenant_delete" ON storage.objects;

CREATE POLICY "invoice_files_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-files' AND (
    split_part(name, '/', 1) = public.get_user_tenant_id()::text
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "invoice_files_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-files' AND (
    split_part(name, '/', 1) = public.get_user_tenant_id()::text
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "invoice_files_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-files' AND (
    split_part(name, '/', 1) = public.get_user_tenant_id()::text
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));