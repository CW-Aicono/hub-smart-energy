CREATE OR REPLACE FUNCTION public.validate_package_sale_input(p_kind text,p_code text,p_quantity integer,p_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF p_kind='module' THEN RAISE EXCEPTION 'Neue Verkäufe nur als Paket'; END IF;
IF p_kind='package' AND p_code='p4_charging' THEN RAISE EXCEPTION 'Ladeinfrastruktur je Ladepunkt buchen'; END IF;
IF p_kind='package' AND p_quantity<>1 THEN RAISE EXCEPTION 'Paketmenge muss 1 sein'; END IF;
IF p_kind='unit' AND p_code='extra_location' AND (EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='package' AND product_code='p6_enterprise' AND ended_on IS NULL) OR EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code='p6_enterprise' AND cancelled_at IS NULL)) THEN RAISE EXCEPTION 'Weitere Liegenschaften sind in Paket 6 enthalten'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_package_sale_input(text,text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_package_sale_input(text,text,integer,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.check_package_only_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN PERFORM public.validate_package_sale_input(NEW.product_kind,NEW.product_code,NEW.quantity,NEW.tenant_id); RETURN NEW; END $$;