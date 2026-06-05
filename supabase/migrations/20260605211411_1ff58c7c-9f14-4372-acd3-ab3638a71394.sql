ALTER TABLE public.charge_point_groups
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_charge_point_groups_location_id
  ON public.charge_point_groups(location_id);