-- Gateway-Device-Inventory: Speichert die lokal vom HA-Add-on gefundenen Entitäten
-- (Sensoren, Aktoren, Zähler), damit die Cloud-UI sie für die Zuordnung anzeigen kann.

CREATE TABLE IF NOT EXISTS public.gateway_device_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_device_id uuid NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_integration_id uuid REFERENCES public.location_integrations(id) ON DELETE SET NULL,
  entity_id text NOT NULL,
  domain text NOT NULL,
  category text NOT NULL DEFAULT 'sensor',
  friendly_name text,
  state text,
  unit text,
  device_class text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_state_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_device_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_gdi_tenant ON public.gateway_device_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gdi_li ON public.gateway_device_inventory(location_integration_id);
CREATE INDEX IF NOT EXISTS idx_gdi_category ON public.gateway_device_inventory(category);

ALTER TABLE public.gateway_device_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read inventory"
  ON public.gateway_device_inventory FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE TRIGGER update_gateway_device_inventory_updated_at
  BEFORE UPDATE ON public.gateway_device_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();