
-- Table for module bundles
CREATE TABLE public.module_bundles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for modules within a bundle
CREATE TABLE public.module_bundle_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id UUID NOT NULL REFERENCES public.module_bundles(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.module_bundle_items ADD CONSTRAINT unique_bundle_module UNIQUE (bundle_id, module_code);

ALTER TABLE public.module_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage module bundles" ON public.module_bundles
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admins can manage module bundle items" ON public.module_bundle_items
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE TRIGGER update_module_bundles_updated_at
  BEFORE UPDATE ON public.module_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
