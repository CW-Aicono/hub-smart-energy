
-- Add custom_role_id to profiles for custom role assignment
ALTER TABLE public.profiles ADD COLUMN custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_profiles_custom_role_id ON public.profiles(custom_role_id);
