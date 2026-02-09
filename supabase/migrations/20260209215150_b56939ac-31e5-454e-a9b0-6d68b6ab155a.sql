
-- Create table for meter readings (Zählerstandsablesungen)
CREATE TABLE public.meter_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  value NUMERIC NOT NULL,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  capture_method TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add constraint for capture_method values
ALTER TABLE public.meter_readings
  ADD CONSTRAINT meter_readings_capture_method_check
  CHECK (capture_method IN ('manual', 'qr', 'ai', 'automatic'));

-- Enable RLS
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view meter readings in their tenant"
  ON public.meter_readings FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert meter readings in their tenant"
  ON public.meter_readings FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update meter readings in their tenant"
  ON public.meter_readings FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can delete meter readings in their tenant"
  ON public.meter_readings FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- Index for fast lookups
CREATE INDEX idx_meter_readings_meter_id ON public.meter_readings(meter_id);
CREATE INDEX idx_meter_readings_tenant_id ON public.meter_readings(tenant_id);
CREATE INDEX idx_meter_readings_reading_date ON public.meter_readings(meter_id, reading_date DESC);

-- Trigger for updated_at
CREATE TRIGGER update_meter_readings_updated_at
  BEFORE UPDATE ON public.meter_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
