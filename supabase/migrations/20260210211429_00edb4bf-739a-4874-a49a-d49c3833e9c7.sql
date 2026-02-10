-- Add polygon_points column to floor_rooms for storing polygon vertices
-- Each point is {x, y} in percentage coordinates relative to the floor plan image
ALTER TABLE public.floor_rooms ADD COLUMN polygon_points jsonb DEFAULT NULL;

COMMENT ON COLUMN public.floor_rooms.polygon_points IS 'Array of {x, y} points in percentage coordinates for polygon room shapes on floor plans';