CREATE TABLE IF NOT EXISTS public.aicono_billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text NOT NULL DEFAULT 'AICONO GmbH',
  street text, postal_code text, city text, country text DEFAULT 'Deutschland',
  register_court text, register_number text, managing_director text,
  vat_id text, tax_number text,
  bank_name text, iban text, bic text,
  email text, phone text, website text,
  payment_terms_days integer NOT NULL DEFAULT 14,
  vat_rate numeric NOT NULL DEFAULT 19,
  number_prefix text NOT NULL DEFAULT 'AIC',
  footer_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aicono_billing_settings TO authenticated;
GRANT ALL ON public.aicono_billing_settings TO service_role;
ALTER TABLE public.aicono_billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing settings read" ON public.aicono_billing_settings;
CREATE POLICY "billing settings read" ON public.aicono_billing_settings FOR SELECT TO authenticated USING (public.can_portal_read(auth.uid(), 'commercial'));
DROP POLICY IF EXISTS "billing settings write" ON public.aicono_billing_settings;
CREATE POLICY "billing settings write" ON public.aicono_billing_settings FOR ALL TO authenticated USING (public.can_portal_write(auth.uid(), 'commercial')) WITH CHECK (public.can_portal_write(auth.uid(), 'commercial'));

INSERT INTO public.aicono_billing_settings (id, company_name, street, postal_code, city, register_court, register_number, managing_director, vat_id, bank_name, iban, email, website, payment_terms_days)
VALUES (true, 'AICONO GmbH', 'Webereistr. 3', '48565', 'Steinfurt', 'Amtsgericht Steinfurt', 'HRB 14327', 'Stephan Tomat', 'DE362443999', 'Kreissparkasse Steinfurt', 'DE80 4035 1060 0075 0257 83', 'info@aicono.org', 'www.aicono.org', 14)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.aicono_invoice_counter (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.aicono_invoice_counter TO service_role;
ALTER TABLE public.aicono_invoice_counter ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS vat_rate numeric;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS issued_by uuid;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS emailed_to text;

CREATE OR REPLACE FUNCTION public.tenant_invoices_lock_issued()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL AND (
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.amount IS DISTINCT FROM OLD.amount OR
    NEW.module_total IS DISTINCT FROM OLD.module_total OR
    NEW.support_total IS DISTINCT FROM OLD.support_total OR
    NEW.line_items IS DISTINCT FROM OLD.line_items OR
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.partner_id IS DISTINCT FROM OLD.partner_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.issued_at IS DISTINCT FROM OLD.issued_at OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR
    NEW.vat_rate IS DISTINCT FROM OLD.vat_rate OR
    NEW.document_type IS DISTINCT FROM OLD.document_type
  ) THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung % kann nicht mehr inhaltlich geändert werden (nur Status/Versand).', OLD.invoice_number;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_invoices_lock_issued ON public.tenant_invoices;
CREATE TRIGGER trg_tenant_invoices_lock_issued BEFORE UPDATE ON public.tenant_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tenant_invoices_lock_issued();

CREATE OR REPLACE FUNCTION public.tenant_invoices_block_issued_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung % darf nicht gelöscht werden – bitte stornieren.', OLD.invoice_number;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_invoices_block_issued_delete ON public.tenant_invoices;
CREATE TRIGGER trg_tenant_invoices_block_issued_delete BEFORE DELETE ON public.tenant_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tenant_invoices_block_issued_delete();

CREATE OR REPLACE FUNCTION public.issue_aicono_invoice(p_invoice_id uuid)
RETURNS public.tenant_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.tenant_invoices;
  v_set public.aicono_billing_settings;
  v_year integer := extract(year from now() AT TIME ZONE 'Europe/Berlin')::int;
  v_no integer;
BEGIN
  IF NOT public.can_portal_write(auth.uid(), 'commercial') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  SELECT * INTO v_inv FROM public.tenant_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rechnung nicht gefunden'; END IF;
  IF v_inv.issued_at IS NOT NULL THEN RETURN v_inv; END IF;
  IF v_inv.status = 'voided' THEN RAISE EXCEPTION 'Stornierte Rechnungen können nicht festgeschrieben werden'; END IF;
  IF v_inv.document_type <> 'invoice' OR coalesce(v_inv.amount,0) <= 0 THEN
    RAISE EXCEPTION 'Nur Rechnungen mit Betrag größer 0 € können festgeschrieben werden';
  END IF;
  SELECT * INTO v_set FROM public.aicono_billing_settings WHERE id = true;
  INSERT INTO public.aicono_invoice_counter (year, last_number) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = public.aicono_invoice_counter.last_number + 1
    RETURNING last_number INTO v_no;
  UPDATE public.tenant_invoices SET
    invoice_number = coalesce(v_set.number_prefix, 'AIC') || '-' || v_year || '-' || lpad(v_no::text, 5, '0'),
    issued_at = now(),
    issued_by = auth.uid(),
    due_date = (now() AT TIME ZONE 'Europe/Berlin')::date + coalesce(v_set.payment_terms_days, 14),
    vat_rate = coalesce(v_set.vat_rate, 19),
    status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
    updated_at = now()
  WHERE id = p_invoice_id RETURNING * INTO v_inv;
  RETURN v_inv;
END $$;
REVOKE ALL ON FUNCTION public.issue_aicono_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_aicono_invoice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_aicono_invoice(p_tenant_id uuid, p_partner_id uuid, p_period_start date, p_period_end date, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_qty numeric; v_unit numeric; v_amt numeric; v_total numeric := 0;
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.can_portal_write(auth.uid(), 'commercial') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'Kunde fehlt'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Mindestens eine Position nötig'; END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF coalesce(trim(v_line->>'label'),'') = '' THEN RAISE EXCEPTION 'Position ohne Bezeichnung'; END IF;
    v_qty := coalesce((v_line->>'quantity')::numeric, 1);
    v_unit := coalesce((v_line->>'unit_price')::numeric, 0);
    v_amt := round(v_qty * v_unit, 2);
    v_total := v_total + v_amt;
    v_lines := v_lines || jsonb_build_object('type','manual','label',left(trim(v_line->>'label'),300),'quantity',v_qty,'unit_price',v_unit,'amount',v_amt);
  END LOOP;
  INSERT INTO public.tenant_invoices (id, tenant_id, partner_id, invoice_kind, source_ref, invoice_number, document_type, status,
    period_start, period_end, amount, module_total, support_total, line_items)
  VALUES (v_id, p_tenant_id, p_partner_id, 'one_time', 'manual:' || v_id, 'DRAFT', 'invoice', 'draft',
    coalesce(p_period_start, current_date), coalesce(p_period_end, p_period_start, current_date), v_total, v_total, 0, v_lines);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_manual_aicono_invoice(uuid, uuid, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_aicono_invoice(uuid, uuid, date, date, jsonb) TO authenticated;