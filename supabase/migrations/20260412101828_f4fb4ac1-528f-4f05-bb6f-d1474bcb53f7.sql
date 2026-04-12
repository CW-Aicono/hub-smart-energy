
-- Invoice design settings per tenant
CREATE TABLE public.charging_invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  company_address text NOT NULL DEFAULT '',
  company_email text DEFAULT '',
  company_phone text DEFAULT '',
  tax_id text DEFAULT '',
  iban text DEFAULT '',
  bic text DEFAULT '',
  bank_name text DEFAULT '',
  footer_text text DEFAULT '',
  logo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.charging_invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view invoice settings"
  ON public.charging_invoice_settings FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert invoice settings"
  ON public.charging_invoice_settings FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invoice settings"
  ON public.charging_invoice_settings FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invoice settings"
  ON public.charging_invoice_settings FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_charging_invoice_settings_updated_at
  BEFORE UPDATE ON public.charging_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add PDF storage path to invoices
ALTER TABLE public.charging_invoices ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('charging-invoices', 'charging-invoices', false);

-- Storage policies
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

CREATE POLICY "Admins can upload invoice PDFs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charging-invoices'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Admins can delete invoice PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'charging-invoices'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin')
    )
  );

-- Storage bucket for invoice design assets (logos)
INSERT INTO storage.buckets (id, name, public) VALUES ('charging-invoice-assets', 'charging-invoice-assets', true);

CREATE POLICY "Anyone can view invoice assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'charging-invoice-assets');

CREATE POLICY "Admins can upload invoice assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charging-invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id::text = split_part(name, '/', 1)
        AND public.has_role(auth.uid(), 'admin')
    )
  );
