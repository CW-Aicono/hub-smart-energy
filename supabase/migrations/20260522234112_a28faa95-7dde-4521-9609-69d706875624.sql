ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS setup_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_validated_by uuid,
  ADD COLUMN IF NOT EXISTS setup_validated_by_email text;