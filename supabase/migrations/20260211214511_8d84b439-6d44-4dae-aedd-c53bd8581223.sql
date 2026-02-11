
-- Global default prices per module
CREATE TABLE public.module_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_code TEXT NOT NULL UNIQUE,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.module_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.module_prices
  FOR ALL USING (true) WITH CHECK (true);

-- Seed with all module codes
INSERT INTO public.module_prices (module_code, price_monthly) VALUES
  ('locations', 0),
  ('integrations', 0),
  ('floor_plans', 0),
  ('energy_monitoring', 0),
  ('reporting', 0),
  ('automation_building', 0),
  ('automation_multi', 0),
  ('ev_charging', 0),
  ('alerts', 0),
  ('meter_scanning', 0),
  ('live_values', 0);

-- Per-tenant price override (NULL = use global default)
ALTER TABLE public.tenant_modules
  ADD COLUMN price_override NUMERIC DEFAULT NULL;
