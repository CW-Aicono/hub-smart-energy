
-- Table for charger manufacturer models managed by Super Admin
CREATE TABLE public.charger_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'ocpp1.6',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor, model)
);

ALTER TABLE public.charger_models ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users (for dropdowns)
CREATE POLICY "Authenticated users can read charger models"
  ON public.charger_models FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only super admins can manage (via service role in practice)
CREATE POLICY "Service role can manage charger models"
  ON public.charger_models FOR ALL
  USING (true)
  WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_charger_models_updated_at
  BEFORE UPDATE ON public.charger_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.charger_models;
