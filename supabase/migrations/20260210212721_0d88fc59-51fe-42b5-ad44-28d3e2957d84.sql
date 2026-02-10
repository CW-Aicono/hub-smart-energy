-- Add label_size column to floor_sensor_positions for resizable meter tiles
ALTER TABLE public.floor_sensor_positions 
ADD COLUMN label_size text NOT NULL DEFAULT 'medium';

-- Constrain to valid sizes
ALTER TABLE public.floor_sensor_positions 
ADD CONSTRAINT floor_sensor_positions_label_size_check 
CHECK (label_size IN ('small', 'medium', 'large'));