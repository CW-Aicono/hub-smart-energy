ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Backfill existing rows with sort_order matching floor_number ordering within a location
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY floor_number, created_at) - 1 AS rn
  FROM public.floors
  WHERE sort_order IS NULL
)
UPDATE public.floors f SET sort_order = ordered.rn FROM ordered WHERE f.id = ordered.id;

ALTER TABLE public.floors ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.floors ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_floors_location_sort_order ON public.floors(location_id, sort_order);