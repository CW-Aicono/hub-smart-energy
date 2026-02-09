-- Create storage bucket for meter photos
INSERT INTO storage.buckets (id, name, public) VALUES ('meter-photos', 'meter-photos', false);

-- Authenticated users can upload meter photos
CREATE POLICY "Authenticated users can upload meter photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meter-photos' AND auth.uid() IS NOT NULL);

-- Authenticated users can view meter photos
CREATE POLICY "Authenticated users can view meter photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'meter-photos' AND auth.uid() IS NOT NULL);

-- Authenticated users can delete their meter photos
CREATE POLICY "Authenticated users can delete meter photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'meter-photos' AND auth.uid() IS NOT NULL);

-- Add photo_url column to meters table
ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS photo_url text;
