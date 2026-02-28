
-- Table for OCPP integration guides per charger model
CREATE TABLE public.ocpp_integration_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charger_model_id UUID REFERENCES public.charger_models(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  ocpp_version TEXT NOT NULL DEFAULT '1.6',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ocpp_integration_guides ENABLE ROW LEVEL SECURITY;

-- Everyone with a valid session can read guides
CREATE POLICY "Authenticated users can read guides"
  ON public.ocpp_integration_guides FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only super admins can manage guides (via service role in edge functions)
CREATE POLICY "Service role can manage guides"
  ON public.ocpp_integration_guides FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER update_ocpp_integration_guides_updated_at
  BEFORE UPDATE ON public.ocpp_integration_guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
