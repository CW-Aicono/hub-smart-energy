-- Repair: charging_invoice_settings fehlt auf Prod
-- Die urspruengliche CREATE TABLE-Migration (20260412101828) war in prod als
-- "applied" markiert (Bootstrap-Drift), wurde aber nie ausgefuehrt.
-- Diese Migration legt die Tabelle idempotent neu an.

CREATE TABLE IF NOT EXISTS public.charging_invoice_settings (
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

DROP POLICY IF EXISTS "Tenant members can view invoice settings" ON public.charging_invoice_settings;
CREATE POLICY "Tenant members can view invoice settings"
  ON public.charging_invoice_settings FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "Admins can insert invoice settings" ON public.charging_invoice_settings;
CREATE POLICY "Admins can insert invoice settings"
  ON public.charging_invoice_settings FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update invoice settings" ON public.charging_invoice_settings;
CREATE POLICY "Admins can update invoice settings"
  ON public.charging_invoice_settings FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete invoice settings" ON public.charging_invoice_settings;
CREATE POLICY "Admins can delete invoice settings"
  ON public.charging_invoice_settings FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_charging_invoice_settings_updated_at ON public.charging_invoice_settings;
CREATE TRIGGER update_charging_invoice_settings_updated_at
  BEFORE UPDATE ON public.charging_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage-Buckets (ebenfalls moeglicherweise nicht angelegt)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('charging-invoices', 'charging-invoices', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('charging-invoice-assets', 'charging-invoice-assets', true)
  ON CONFLICT (id) DO NOTHING;
