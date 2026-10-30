-- Schritt 1: Preisstammdaten versionieren, Sollwerte setzen, alte Bundles kennzeichnen

-- 1) Gültig-ab-Datum auf beiden Preistabellen (additiv)
ALTER TABLE public.pricing_packages ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.pricing_unit_prices ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;
COMMENT ON COLUMN public.pricing_packages.valid_from IS 'Preis gültig ab diesem Datum; bereits erzeugte Rechnungen bleiben unverändert';
COMMENT ON COLUMN public.pricing_unit_prices.valid_from IS 'Preis gültig ab diesem Datum; bereits erzeugte Rechnungen bleiben unverändert';

-- 2) Versionshistorie für Preisänderungen
CREATE TABLE IF NOT EXISTS public.pricing_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  code text NOT NULL,
  field text NOT NULL,
  old_value numeric,
  new_value numeric,
  valid_from date NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_price_history TO authenticated;
GRANT ALL ON public.pricing_price_history TO service_role;
ALTER TABLE public.pricing_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price history read" ON public.pricing_price_history FOR SELECT TO authenticated
  USING (public.can_portal_read(auth.uid(), 'commercial'));

-- 3) Trigger protokolliert jede Preisänderung automatisch
CREATE OR REPLACE FUNCTION public.log_pricing_price_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.uvp IS DISTINCT FROM OLD.uvp THEN
    INSERT INTO public.pricing_price_history (table_name, code, field, old_value, new_value, valid_from, changed_by)
    VALUES (TG_TABLE_NAME, OLD.code, 'uvp', OLD.uvp, NEW.uvp, NEW.valid_from, auth.uid());
  END IF;
  IF NEW.ek IS DISTINCT FROM OLD.ek THEN
    INSERT INTO public.pricing_price_history (table_name, code, field, old_value, new_value, valid_from, changed_by)
    VALUES (TG_TABLE_NAME, OLD.code, 'ek', OLD.ek, NEW.ek, NEW.valid_from, auth.uid());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.log_pricing_price_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_pricing_price_change() TO service_role;

DROP TRIGGER IF EXISTS log_pricing_packages_price ON public.pricing_packages;
CREATE TRIGGER log_pricing_packages_price AFTER UPDATE OF uvp, ek, valid_from ON public.pricing_packages
  FOR EACH ROW EXECUTE FUNCTION public.log_pricing_price_change();
DROP TRIGGER IF EXISTS log_pricing_unit_prices_price ON public.pricing_unit_prices;
CREATE TRIGGER log_pricing_unit_prices_price AFTER UPDATE OF uvp, ek, valid_from ON public.pricing_unit_prices
  FOR EACH ROW EXECUTE FUNCTION public.log_pricing_price_change();

-- 4) Sollwerte laut Preisliste (Backfill der Katalogdaten im Zuge der Versionierung)
UPDATE public.pricing_unit_prices SET ek = 6.00, valid_from = CURRENT_DATE, updated_at = now() WHERE code = 'charge_point';
UPDATE public.pricing_unit_prices SET ek = 112.00, partner_available = true, valid_from = CURRENT_DATE, updated_at = now() WHERE code = 'remote_support';

-- 5) Alte Bundles als Altvertrag kennzeichnen (bestehende Buchungen laufen unverändert weiter)
ALTER TABLE public.module_bundles ADD COLUMN IF NOT EXISTS bookable boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.module_bundles.bookable IS 'false = Altvertrag – nicht mehr neu buchbar; Mandanten mit bestehender Buchung werden unverändert weiter abgerechnet';