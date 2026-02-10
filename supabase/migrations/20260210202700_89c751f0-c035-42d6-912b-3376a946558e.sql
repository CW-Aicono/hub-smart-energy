
-- Add 3D X and Z position columns for meter placement in 3D view
ALTER TABLE public.meters
ADD COLUMN position_3d_x real DEFAULT NULL,
ADD COLUMN position_3d_z real DEFAULT NULL;
