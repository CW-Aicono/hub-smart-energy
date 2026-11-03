ALTER TABLE public.pricing_unit_prices ADD COLUMN IF NOT EXISTS new_sale_uvp numeric;
ALTER TABLE public.pricing_unit_prices ADD COLUMN IF NOT EXISTS partner_available boolean NOT NULL DEFAULT true;
UPDATE public.pricing_unit_prices SET new_sale_uvp=CASE WHEN code='charge_point' THEN 8 ELSE uvp END WHERE new_sale_uvp IS NULL;
UPDATE public.pricing_unit_prices SET partner_available=false WHERE code='remote_support';
COMMENT ON COLUMN public.pricing_unit_prices.new_sale_uvp IS 'New sale catalog price; historical uvp and stored contracts remain unchanged';
CREATE OR REPLACE FUNCTION public.check_package_only_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF NEW.product_kind='module' THEN RAISE EXCEPTION 'Neue Verkäufe nur als Paket, keine einzelnen Module'; END IF;
IF NEW.product_kind='unit' AND NEW.product_code='extra_location' AND (EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=NEW.tenant_id AND product_kind='package' AND product_code='p6_enterprise' AND ended_on IS NULL) OR EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=NEW.tenant_id AND package_code='p6_enterprise' AND cancelled_at IS NULL)) THEN RAISE EXCEPTION 'Weitere Liegenschaften sind in Paket 6 enthalten'; END IF;
RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER check_package_only_sale BEFORE INSERT ON public.license_sales FOR EACH ROW EXECUTE FUNCTION public.check_package_only_sale();
REVOKE ALL ON FUNCTION public.check_package_only_sale() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_package_only_sale() TO service_role;