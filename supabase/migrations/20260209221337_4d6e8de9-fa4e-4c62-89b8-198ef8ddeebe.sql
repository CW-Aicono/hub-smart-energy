
-- Table for scanners (mobile reading stations) created under Integrations
CREATE TABLE public.meter_scanners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meter_scanners ENABLE ROW LEVEL SECURITY;

-- RLS policies for meter_scanners
CREATE POLICY "Users can view scanners of their tenant"
  ON public.meter_scanners FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can create scanners"
  ON public.meter_scanners FOR INSERT
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can update scanners"
  ON public.meter_scanners FOR UPDATE
  USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can delete scanners"
  ON public.meter_scanners FOR DELETE
  USING (tenant_id = (SELECT get_user_tenant_id()));

-- Trigger for updated_at
CREATE TRIGGER update_meter_scanners_updated_at
  BEFORE UPDATE ON public.meter_scanners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add permission for mobile meter reading
INSERT INTO public.permissions (code, name, description, category)
VALUES ('meter_reading_app', 'Zähler per App ablesen', 'Erlaubt das Ablesen von Zählern über die mobile App', 'meters')
ON CONFLICT (code) DO NOTHING;
