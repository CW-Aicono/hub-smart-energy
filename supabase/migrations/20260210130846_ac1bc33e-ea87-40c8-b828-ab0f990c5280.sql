
-- Add hierarchy columns to meters
ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS parent_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_main_meter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meter_function text NOT NULL DEFAULT 'consumption';

-- Index for tree queries
CREATE INDEX IF NOT EXISTS idx_meters_parent ON public.meters(parent_meter_id);
CREATE INDEX IF NOT EXISTS idx_meters_main ON public.meters(is_main_meter) WHERE is_main_meter = true;

-- Prevent self-reference and circular hierarchies
CREATE OR REPLACE FUNCTION public.check_meter_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_id uuid;
  depth int := 0;
BEGIN
  -- No self-reference
  IF NEW.parent_meter_id IS NOT NULL AND NEW.parent_meter_id = NEW.id THEN
    RAISE EXCEPTION 'A meter cannot reference itself as parent';
  END IF;

  -- Check for cycles by walking up the tree
  IF NEW.parent_meter_id IS NOT NULL THEN
    current_id := NEW.parent_meter_id;
    WHILE current_id IS NOT NULL AND depth < 100 LOOP
      IF current_id = NEW.id THEN
        RAISE EXCEPTION 'Circular reference detected in meter hierarchy';
      END IF;
      SELECT parent_meter_id INTO current_id FROM public.meters WHERE id = current_id;
      depth := depth + 1;
    END LOOP;
    IF depth >= 100 THEN
      RAISE EXCEPTION 'Meter hierarchy exceeds maximum depth of 100';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_meter_hierarchy
  BEFORE INSERT OR UPDATE OF parent_meter_id ON public.meters
  FOR EACH ROW
  EXECUTE FUNCTION public.check_meter_hierarchy();
