
-- Create location_energy_sources table
CREATE TABLE public.location_energy_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  energy_type text NOT NULL DEFAULT 'sonstiges',
  custom_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_location_energy_sources_location ON public.location_energy_sources(location_id);
CREATE INDEX idx_location_energy_sources_tenant ON public.location_energy_sources(tenant_id);

-- Enable RLS
ALTER TABLE public.location_energy_sources ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "select_own_tenant" ON public.location_energy_sources
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "insert_own_tenant" ON public.location_energy_sources
FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "update_own_tenant" ON public.location_energy_sources
FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "delete_own_tenant" ON public.location_energy_sources
FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant_id());

-- Updated_at trigger
CREATE TRIGGER update_location_energy_sources_updated_at
  BEFORE UPDATE ON public.location_energy_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing energy_sources array data into the new table
INSERT INTO public.location_energy_sources (location_id, tenant_id, energy_type, custom_name, sort_order)
SELECT
  l.id,
  l.tenant_id,
  es.val,
  CASE es.val
    WHEN 'strom' THEN 'Strom'
    WHEN 'gas' THEN 'Gas'
    WHEN 'waerme' THEN 'Fernwärme'
    WHEN 'solar' THEN 'Solar'
    WHEN 'wasser' THEN 'Wasser'
    WHEN 'oel' THEN 'Öl'
    WHEN 'pellets' THEN 'Pellets'
    WHEN 'fernwaerme' THEN 'Fernwärme'
    ELSE es.val
  END,
  es.ord
FROM public.locations l,
LATERAL unnest(l.energy_sources) WITH ORDINALITY AS es(val, ord)
WHERE l.energy_sources IS NOT NULL AND array_length(l.energy_sources, 1) > 0;
