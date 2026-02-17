-- Allow admins to delete profiles of other users
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow super_admins to delete profiles
CREATE POLICY "Super admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add last_intraday_sync_at column to brighthub_settings
ALTER TABLE public.brighthub_settings
ADD COLUMN IF NOT EXISTS last_intraday_sync_at timestamptz;