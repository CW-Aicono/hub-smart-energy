-- Table to store sensor positions on floor plans
CREATE TABLE public.floor_sensor_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  location_integration_id UUID NOT NULL REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  sensor_uuid TEXT NOT NULL,
  sensor_name TEXT NOT NULL,
  position_x DECIMAL(5,2) NOT NULL CHECK (position_x >= 0 AND position_x <= 100),
  position_y DECIMAL(5,2) NOT NULL CHECK (position_y >= 0 AND position_y <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(floor_id, sensor_uuid)
);

-- Enable RLS
ALTER TABLE public.floor_sensor_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access sensors from their tenant's floors
CREATE POLICY "Users can view floor sensor positions for their tenant"
  ON public.floor_sensor_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.locations l ON f.location_id = l.id
      WHERE f.id = floor_sensor_positions.floor_id
      AND l.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can insert floor sensor positions for their tenant"
  ON public.floor_sensor_positions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.locations l ON f.location_id = l.id
      WHERE f.id = floor_sensor_positions.floor_id
      AND l.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can update floor sensor positions for their tenant"
  ON public.floor_sensor_positions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.locations l ON f.location_id = l.id
      WHERE f.id = floor_sensor_positions.floor_id
      AND l.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Users can delete floor sensor positions for their tenant"
  ON public.floor_sensor_positions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.locations l ON f.location_id = l.id
      WHERE f.id = floor_sensor_positions.floor_id
      AND l.tenant_id = public.get_user_tenant_id()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_floor_sensor_positions_updated_at
  BEFORE UPDATE ON public.floor_sensor_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_floor_sensor_positions_floor_id ON public.floor_sensor_positions(floor_id);
CREATE INDEX idx_floor_sensor_positions_location_integration_id ON public.floor_sensor_positions(location_integration_id);