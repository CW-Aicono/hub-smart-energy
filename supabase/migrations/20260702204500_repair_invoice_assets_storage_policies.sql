-- Repair: Storage-Policies fuer charging-invoice-assets und charging-invoices
-- fehlen auf Prod. Die Original-Migrationen (20260412101828: SELECT/INSERT,
-- 20260617100618: UPDATE/DELETE) waren in prod als "applied" markiert
-- (Bootstrap-Drift), wurden aber nie ausgefuehrt. Die Repair-Migration
-- 20260625120000 hat nur die Buckets nachgezogen, nicht die
-- storage.objects-Policies -> Logo-Upload scheitert mit
-- "new row violates row-level security policy".
-- Diese Migration legt alle Policies idempotent neu an.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('charging-invoice-assets', 'charging-invoice-assets', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('charging-invoices', 'charging-invoices', false)
  ON CONFLICT (id) DO NOTHING;

-- === Bucket charging-invoice-assets (oeffentliche Logos) ===

DROP POLICY IF EXISTS "Anyone can view invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant can list invoice assets" ON storage.objects;
CREATE POLICY "Tenant can list invoice assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'charging-invoice-assets'
    AND split_part(name, '/', 1) = (
      SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can upload invoice assets" ON storage.objects;
CREATE POLICY "Admins can upload invoice assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charging-invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins can update invoice assets" ON storage.objects;
CREATE POLICY "Admins can update invoice assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'charging-invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(objects.name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'charging-invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(objects.name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins can delete invoice assets" ON storage.objects;
CREATE POLICY "Admins can delete invoice assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'charging-invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(objects.name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- === Bucket charging-invoices (private Rechnungs-PDFs) ===

DROP POLICY IF EXISTS "Tenant members can read invoice PDFs" ON storage.objects;
CREATE POLICY "Tenant members can read invoice PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'charging-invoices'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Admins can upload invoice PDFs" ON storage.objects;
CREATE POLICY "Admins can upload invoice PDFs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charging-invoices'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins can delete invoice PDFs" ON storage.objects;
CREATE POLICY "Admins can delete invoice PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'charging-invoices'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );
