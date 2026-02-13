
-- Fix: add UPDATE policy for meter-photos storage bucket
CREATE POLICY "Authenticated users can update meter photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meter-photos' AND auth.uid() IS NOT NULL);

-- Add address/geo columns to charge_points for map support
ALTER TABLE public.charge_points
  ADD COLUMN address text,
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision;
