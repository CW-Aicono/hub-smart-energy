
-- Add location_id to brighthub_settings for per-location configuration
ALTER TABLE public.brighthub_settings
  ADD COLUMN location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE;

-- Drop old unique constraint on tenant_id only
ALTER TABLE public.brighthub_settings
  DROP CONSTRAINT IF EXISTS brighthub_settings_tenant_id_key;

-- Add new unique constraint: one setting per location per tenant
ALTER TABLE public.brighthub_settings
  ADD CONSTRAINT brighthub_settings_tenant_location_unique UNIQUE (tenant_id, location_id);

-- Update RLS policies to also check location access
DROP POLICY IF EXISTS "Users can view their tenant brighthub settings" ON public.brighthub_settings;
CREATE POLICY "Users can view their tenant brighthub settings"
  ON public.brighthub_settings FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "Admins can insert brighthub settings" ON public.brighthub_settings;
CREATE POLICY "Admins can insert brighthub settings"
  ON public.brighthub_settings FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update brighthub settings" ON public.brighthub_settings;
CREATE POLICY "Admins can update brighthub settings"
  ON public.brighthub_settings FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));
