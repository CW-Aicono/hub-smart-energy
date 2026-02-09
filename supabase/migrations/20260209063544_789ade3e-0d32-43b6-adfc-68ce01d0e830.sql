-- Create floor_rooms table for 3D room definitions
CREATE TABLE public.floor_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 4,
  depth NUMERIC NOT NULL DEFAULT 4,
  wall_height NUMERIC NOT NULL DEFAULT 2.8,
  color TEXT DEFAULT '#f0f0f0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add 3D position columns to floor_sensor_positions
ALTER TABLE public.floor_sensor_positions
ADD COLUMN IF NOT EXISTS position_z NUMERIC DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES floor_rooms(id) ON DELETE SET NULL;

-- Enable RLS on floor_rooms
ALTER TABLE public.floor_rooms ENABLE ROW LEVEL SECURITY;

-- RLS policies for floor_rooms (similar to floors)
CREATE POLICY "Users can view floor rooms of their tenant locations" 
ON public.floor_rooms 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM floors f
  JOIN locations l ON f.location_id = l.id
  WHERE f.id = floor_rooms.floor_id AND l.tenant_id = get_user_tenant_id()
));

CREATE POLICY "Admins can insert floor rooms" 
ON public.floor_rooms 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND 
  EXISTS (
    SELECT 1 FROM floors f
    JOIN locations l ON f.location_id = l.id
    WHERE f.id = floor_rooms.floor_id AND l.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Admins can update floor rooms" 
ON public.floor_rooms 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  EXISTS (
    SELECT 1 FROM floors f
    JOIN locations l ON f.location_id = l.id
    WHERE f.id = floor_rooms.floor_id AND l.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Admins can delete floor rooms" 
ON public.floor_rooms 
FOR DELETE 
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  EXISTS (
    SELECT 1 FROM floors f
    JOIN locations l ON f.location_id = l.id
    WHERE f.id = floor_rooms.floor_id AND l.tenant_id = get_user_tenant_id()
  )
);

-- Create trigger for updated_at on floor_rooms
CREATE TRIGGER update_floor_rooms_updated_at
BEFORE UPDATE ON public.floor_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();