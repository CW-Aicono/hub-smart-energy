-- 1. Enum für Gerätetyp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dlm_device_kind') THEN
    CREATE TYPE public.dlm_device_kind AS ENUM (
      'charge_point',
      'heat_pump',
      'battery',
      'generic_actuator'
    );
  END IF;
END $$;

-- 2. Tabelle
CREATE TABLE IF NOT EXISTS public.location_dlm_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_kind public.dlm_device_kind NOT NULL,
  -- Fremdschlüssel-artige Referenz: charge_points.id für 'charge_point',
  -- gateway_device_entities.id (Aktor-UUID) für Wärmepumpe/Batterie/Aktor.
  -- Wir verzichten auf harten FK, weil der Zieltyp variiert.
  device_ref_id UUID NOT NULL,
  display_name TEXT,
  min_power_kw NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_power_kw NUMERIC(8,2) NOT NULL DEFAULT 11,
  priority INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, device_kind, device_ref_id)
);

CREATE INDEX IF NOT EXISTS location_dlm_devices_location_priority_idx
  ON public.location_dlm_devices (location_id, priority);
CREATE INDEX IF NOT EXISTS location_dlm_devices_tenant_idx
  ON public.location_dlm_devices (tenant_id);

-- 3. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_dlm_devices TO authenticated;
GRANT ALL ON public.location_dlm_devices TO service_role;

-- 4. RLS
ALTER TABLE public.location_dlm_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can read own dlm devices"
  ON public.location_dlm_devices
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Tenant users can insert own dlm devices"
  ON public.location_dlm_devices
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Tenant users can update own dlm devices"
  ON public.location_dlm_devices
  FOR UPDATE
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Tenant users can delete own dlm devices"
  ON public.location_dlm_devices
  FOR DELETE
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Partner members can read tenant dlm devices"
  ON public.location_dlm_devices
  FOR SELECT
  TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

-- 5. updated_at Trigger
CREATE TRIGGER trg_location_dlm_devices_updated_at
  BEFORE UPDATE ON public.location_dlm_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Bestehende priority_order (Wallbox-IDs) aus location_dlm_config
--    in die neue Tabelle übernehmen.
INSERT INTO public.location_dlm_devices
  (tenant_id, location_id, device_kind, device_ref_id, display_name, min_power_kw, max_power_kw, priority)
SELECT
  c.tenant_id,
  c.location_id,
  'charge_point'::public.dlm_device_kind,
  (elem)::uuid AS device_ref_id,
  cp.name,
  1.4,
  COALESCE(cp.max_power_kw, 11),
  ord.rn * 10 AS priority
FROM public.location_dlm_config c
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(c.priority_order) = 'array' THEN c.priority_order
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS ord(elem, rn)
LEFT JOIN public.charge_points cp ON cp.id = (elem)::uuid
WHERE EXISTS (SELECT 1 FROM public.charge_points cpx WHERE cpx.id = (elem)::uuid)
ON CONFLICT (location_id, device_kind, device_ref_id) DO NOTHING;
