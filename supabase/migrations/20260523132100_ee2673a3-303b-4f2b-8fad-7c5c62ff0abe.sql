-- 1) Backfill: create missing charge_point_connectors rows for existing charge_points
INSERT INTO public.charge_point_connectors
  (charge_point_id, connector_id, display_order, status, connector_type, max_power_kw)
SELECT
  cp.id,
  gs.i,
  gs.i - 1,
  'unconfigured',
  COALESCE(cp.connector_type, 'Type2'),
  COALESCE(cp.max_power_kw, 22)
FROM public.charge_points cp
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(cp.connector_count, 1), 1)) AS gs(i)
WHERE NOT EXISTS (
  SELECT 1 FROM public.charge_point_connectors c
  WHERE c.charge_point_id = cp.id AND c.connector_id = gs.i
);

-- 2) Trigger: auto-seed connector rows whenever a new charge_point is inserted
CREATE OR REPLACE FUNCTION public.seed_charge_point_connectors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.charge_point_connectors
    (charge_point_id, connector_id, display_order, status, connector_type, max_power_kw)
  SELECT
    NEW.id,
    gs.i,
    gs.i - 1,
    'unconfigured',
    COALESCE(NEW.connector_type, 'Type2'),
    COALESCE(NEW.max_power_kw, 22)
  FROM generate_series(1, GREATEST(COALESCE(NEW.connector_count, 1), 1)) AS gs(i)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_charge_point_connectors ON public.charge_points;
CREATE TRIGGER trg_seed_charge_point_connectors
  AFTER INSERT ON public.charge_points
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_charge_point_connectors();