ALTER TABLE public.floor_rooms ADD COLUMN IF NOT EXISTS area_m2 numeric;
ALTER TABLE public.floor_rooms ADD COLUMN IF NOT EXISTS cost_center text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS allocation_key text NOT NULL DEFAULT 'area';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_allocation_key_check') THEN
    ALTER TABLE public.locations ADD CONSTRAINT locations_allocation_key_check CHECK (allocation_key IN ('area','equal','none'));
  END IF;
END $$;
COMMENT ON COLUMN public.floor_rooms.area_m2 IS 'Manual room/department area for cost allocation; falls back to width*depth';
COMMENT ON COLUMN public.locations.allocation_key IS 'Key for distributing unmetered remainder to rooms: area | equal | none';