
-- Energy prices per location and energy type
CREATE TABLE public.energy_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  energy_type TEXT NOT NULL DEFAULT 'strom',
  price_per_unit NUMERIC(10, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  unit TEXT NOT NULL DEFAULT 'kWh',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.energy_prices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view energy prices for their tenant"
ON public.energy_prices FOR SELECT
USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can insert energy prices"
ON public.energy_prices FOR INSERT
WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can update energy prices"
ON public.energy_prices FOR UPDATE
USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "Admins can delete energy prices"
ON public.energy_prices FOR DELETE
USING (tenant_id = (SELECT get_user_tenant_id()));

-- Trigger for updated_at
CREATE TRIGGER update_energy_prices_updated_at
BEFORE UPDATE ON public.energy_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_energy_prices_location_type ON public.energy_prices(location_id, energy_type);
