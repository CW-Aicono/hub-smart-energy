ALTER TABLE public.charge_points ALTER COLUMN ocpp_id DROP NOT NULL;

-- Ersetze Unique-Constraint durch partiellen Unique-Index, damit mehrere NULLs erlaubt sind
ALTER TABLE public.charge_points DROP CONSTRAINT IF EXISTS charge_points_tenant_id_ocpp_id_key;
DROP INDEX IF EXISTS public.charge_points_tenant_id_ocpp_id_key;
DROP INDEX IF EXISTS public.charge_points_ocpp_id_unique;

CREATE UNIQUE INDEX charge_points_tenant_ocpp_id_unique
  ON public.charge_points (tenant_id, ocpp_id)
  WHERE ocpp_id IS NOT NULL;

CREATE UNIQUE INDEX charge_points_ocpp_id_unique
  ON public.charge_points (ocpp_id)
  WHERE ocpp_id IS NOT NULL;