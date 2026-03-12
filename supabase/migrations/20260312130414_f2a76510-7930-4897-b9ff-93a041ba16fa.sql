
-- 1. Create energy_supplier_invoices table
CREATE TABLE public.energy_supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  invoice_number TEXT,
  supplier_name TEXT,
  energy_type TEXT DEFAULT 'strom',
  period_start DATE,
  period_end DATE,
  consumption_kwh NUMERIC DEFAULT 0,
  consumption_unit TEXT DEFAULT 'kWh',
  total_gross NUMERIC DEFAULT 0,
  total_net NUMERIC,
  tax_amount NUMERIC,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'draft',
  file_path TEXT,
  ai_confidence TEXT DEFAULT 'low',
  ai_raw_response JSONB,
  correction_of_id UUID REFERENCES public.energy_supplier_invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Updated_at trigger
CREATE TRIGGER set_updated_at_energy_supplier_invoices
  BEFORE UPDATE ON public.energy_supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS
ALTER TABLE public.energy_supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their invoices"
  ON public.energy_supplier_invoices FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can insert invoices"
  ON public.energy_supplier_invoices FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can update their invoices"
  ON public.energy_supplier_invoices FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can delete their invoices"
  ON public.energy_supplier_invoices FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- 4. Storage bucket for invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-files', 'invoice-files', false);

-- 5. Storage RLS policies
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoice-files');

CREATE POLICY "Users can view their invoice files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoice-files');

CREATE POLICY "Users can delete their invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'invoice-files');
