
-- Table to store the source meters and their operators for virtual meters
CREATE TABLE public.virtual_meter_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  virtual_meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  source_meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  operator TEXT NOT NULL DEFAULT '+' CHECK (operator IN ('+', '-')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate source assignments
  UNIQUE(virtual_meter_id, source_meter_id)
);

-- Enable RLS
ALTER TABLE public.virtual_meter_sources ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage virtual meter sources for meters in their tenant
CREATE POLICY "Users can view virtual meter sources for their tenant meters"
  ON public.virtual_meter_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meters m
      JOIN public.profiles p ON p.tenant_id = m.tenant_id
      WHERE m.id = virtual_meter_sources.virtual_meter_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert virtual meter sources for their tenant meters"
  ON public.virtual_meter_sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meters m
      JOIN public.profiles p ON p.tenant_id = m.tenant_id
      WHERE m.id = virtual_meter_sources.virtual_meter_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update virtual meter sources for their tenant meters"
  ON public.virtual_meter_sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.meters m
      JOIN public.profiles p ON p.tenant_id = m.tenant_id
      WHERE m.id = virtual_meter_sources.virtual_meter_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete virtual meter sources for their tenant meters"
  ON public.virtual_meter_sources FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.meters m
      JOIN public.profiles p ON p.tenant_id = m.tenant_id
      WHERE m.id = virtual_meter_sources.virtual_meter_id
        AND p.user_id = auth.uid()
    )
  );
