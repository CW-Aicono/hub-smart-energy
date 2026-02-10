-- Add 3D Y-axis position for meter labels in 3D view
ALTER TABLE public.meters ADD COLUMN position_3d_y real DEFAULT 2.5;