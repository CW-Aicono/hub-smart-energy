-- Add is_archived column to locations
ALTER TABLE public.locations ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Index for filtering
CREATE INDEX idx_locations_is_archived ON public.locations (is_archived);
