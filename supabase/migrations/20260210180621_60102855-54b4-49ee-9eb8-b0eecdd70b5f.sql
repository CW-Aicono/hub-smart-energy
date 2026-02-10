-- Add manual rotation override for 3D models (degrees, 0-360, nullable = auto-detect)
ALTER TABLE public.floors 
ADD COLUMN model_3d_rotation integer DEFAULT NULL;