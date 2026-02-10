
-- Add floor_id and room_id columns to meters for hierarchical assignment
ALTER TABLE public.meters
ADD COLUMN floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
ADD COLUMN room_id UUID REFERENCES public.floor_rooms(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_meters_floor_id ON public.meters(floor_id);
CREATE INDEX idx_meters_room_id ON public.meters(room_id);
