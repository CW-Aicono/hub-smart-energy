
-- Add is_archived column to meters table
ALTER TABLE public.meters ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Add index for quick filtering
CREATE INDEX idx_meters_is_archived ON public.meters (is_archived);
