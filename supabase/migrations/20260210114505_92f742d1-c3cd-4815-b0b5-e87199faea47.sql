
-- Create storage bucket for 3D models
INSERT INTO storage.buckets (id, name, public)
VALUES ('floor-3d-models', 'floor-3d-models', true);

-- RLS: anyone can read
CREATE POLICY "Public read access for 3D models"
ON storage.objects FOR SELECT
USING (bucket_id = 'floor-3d-models');

-- RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload 3D models"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'floor-3d-models' AND auth.role() = 'authenticated');

-- RLS: authenticated users can update their uploads
CREATE POLICY "Authenticated users can update 3D models"
ON storage.objects FOR UPDATE
USING (bucket_id = 'floor-3d-models' AND auth.role() = 'authenticated');

-- RLS: authenticated users can delete their uploads
CREATE POLICY "Authenticated users can delete 3D models"
ON storage.objects FOR DELETE
USING (bucket_id = 'floor-3d-models' AND auth.role() = 'authenticated');

-- Add 3D model columns to floors table
ALTER TABLE public.floors
ADD COLUMN model_3d_url TEXT,
ADD COLUMN model_3d_mtl_url TEXT;
