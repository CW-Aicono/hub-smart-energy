
-- 1. Create user_location_access table
CREATE TABLE public.user_location_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, location_id)
);

ALTER TABLE public.user_location_access ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to check location access (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_location_access(_user_id UUID, _location_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'admin'::app_role)
    OR has_role(_user_id, 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_location_access
      WHERE user_id = _user_id AND location_id = _location_id
    )
$$;

-- 3. RLS policies for user_location_access
-- Admins can read all access entries in their tenant
CREATE POLICY "Admins can view all location access in tenant"
ON public.user_location_access
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.profiles p2 ON p.tenant_id = p2.tenant_id
    WHERE p.user_id = auth.uid() AND p2.user_id = user_location_access.user_id
  )
);

-- Users can view their own access entries
CREATE POLICY "Users can view own location access"
ON public.user_location_access
FOR SELECT
USING (auth.uid() = user_id);

-- Super admins can view all
CREATE POLICY "Super admins can view all location access"
ON public.user_location_access
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Admins can insert access entries for users in their tenant
CREATE POLICY "Admins can insert location access"
ON public.user_location_access
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.profiles p2 ON p.tenant_id = p2.tenant_id
    WHERE p.user_id = auth.uid() AND p2.user_id = user_location_access.user_id
  )
);

-- Admins can delete access entries for users in their tenant
CREATE POLICY "Admins can delete location access"
ON public.user_location_access
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.profiles p2 ON p.tenant_id = p2.tenant_id
    WHERE p.user_id = auth.uid() AND p2.user_id = user_location_access.user_id
  )
);

-- 4. Update locations SELECT policy: replace the existing one
DROP POLICY IF EXISTS "Users can view locations in their tenant" ON public.locations;

CREATE POLICY "Users can view locations in their tenant"
ON public.locations
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_location_access(auth.uid(), id)
  )
);
