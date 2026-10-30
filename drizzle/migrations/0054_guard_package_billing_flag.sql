CREATE OR REPLACE FUNCTION public.guard_tenant_package_billing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF (NEW.package_billing IS DISTINCT FROM OLD.package_billing OR NEW.package_billing_from IS DISTINCT FROM OLD.package_billing_from) AND auth.uid() IS NOT NULL AND NOT can_portal_write(auth.uid(),'commercial') THEN RAISE EXCEPTION 'Nur AICONO-Admins dürfen die Abrechnung umstellen'; END IF;
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_guard_tenant_package_billing ON public.tenants;
CREATE TRIGGER trg_guard_tenant_package_billing BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_package_billing();
CREATE OR REPLACE FUNCTION public.guard_tenant_module_individual() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.individual_grant IS DISTINCT FROM OLD.individual_grant AND auth.uid() IS NOT NULL AND NOT can_portal_write(auth.uid(),'commercial') THEN NEW.individual_grant:=OLD.individual_grant; END IF;
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_guard_tenant_module_individual ON public.tenant_modules;
CREATE TRIGGER trg_guard_tenant_module_individual BEFORE UPDATE ON public.tenant_modules FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_module_individual();