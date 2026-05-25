ALTER TABLE public.charging_tariffs ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS charging_tariffs_one_default_per_tenant
  ON public.charging_tariffs (tenant_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.unset_other_default_charging_tariffs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.charging_tariffs
       SET is_default = false
     WHERE tenant_id = NEW.tenant_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unset_other_default_charging_tariffs ON public.charging_tariffs;
CREATE TRIGGER trg_unset_other_default_charging_tariffs
BEFORE INSERT OR UPDATE OF is_default ON public.charging_tariffs
FOR EACH ROW
EXECUTE FUNCTION public.unset_other_default_charging_tariffs();