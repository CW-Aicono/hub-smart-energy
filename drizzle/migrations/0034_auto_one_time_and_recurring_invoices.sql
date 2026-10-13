ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS partner_id uuid NULL REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'recurring';
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS source_ref text NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_invoices_invoice_kind_check') THEN
    ALTER TABLE public.tenant_invoices ADD CONSTRAINT tenant_invoices_invoice_kind_check CHECK (invoice_kind IN ('recurring','one_time'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invoices_source_ref_active_uidx
  ON public.tenant_invoices (source_ref) WHERE source_ref IS NOT NULL AND status <> 'voided';
CREATE INDEX IF NOT EXISTS tenant_invoices_partner_id_idx ON public.tenant_invoices (partner_id);
COMMENT ON COLUMN public.tenant_invoices.partner_id IS 'Rechnungsempfänger Partner (EK). NULL = Rechnung an den Mandanten selbst.';
COMMENT ON COLUMN public.tenant_invoices.source_ref IS 'Idempotenzschlüssel des auslösenden Vorgangs (setup:, prorata:, unlock:, monthly:).';

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS lexware_contact_id text NULL;
ALTER TABLE public.pricing_packages ADD COLUMN IF NOT EXISTS partner_unlock_fee numeric NOT NULL DEFAULT 0;

-- Endkunden dürfen an ihren Partner adressierte Rechnungen (EK) nicht sehen
DROP POLICY IF EXISTS "Tenants can view own invoices" ON public.tenant_invoices;
CREATE POLICY "Tenants can view own invoices" ON public.tenant_invoices
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND partner_id IS NULL);

-- Partner sehen nur Rechnungen, die an sie adressiert sind
DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.tenant_invoices;
CREATE POLICY "Partner members can read tenant data" ON public.tenant_invoices
  FOR SELECT TO authenticated
  USING (partner_id IS NOT NULL AND public.is_partner_member(auth.uid(), partner_id));

-- Einrichtungsgebühr bei jeder Kundenanlage (Portal, Partner, Vertrieb)
CREATE OR REPLACE FUNCTION public.create_setup_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uvp numeric; v_ek numeric; v_amount numeric; v_partner uuid;
BEGIN
  SELECT uvp, ek INTO v_uvp, v_ek FROM public.pricing_unit_prices WHERE code = 'setup';
  v_partner := NEW.partner_id;
  v_amount := CASE WHEN v_partner IS NULL THEN COALESCE(v_uvp,0) ELSE COALESCE(v_ek,0) END;
  IF v_amount <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.tenant_invoices (tenant_id, partner_id, invoice_kind, source_ref, invoice_number, document_type,
    period_start, period_end, amount, module_total, support_total, status, line_items)
  VALUES (NEW.id, v_partner, 'one_time', 'setup:' || NEW.id, 'DRAFT', 'invoice',
    CURRENT_DATE, CURRENT_DATE, v_amount, v_amount, 0, 'draft',
    jsonb_build_array(jsonb_build_object('type','one_time','label','Einrichtung ' || NEW.name, 'quantity',1, 'amount', v_amount)))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_setup_invoice: %', SQLERRM;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_setup_invoice ON public.tenants;
CREATE TRIGGER trg_create_setup_invoice AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_setup_invoice();