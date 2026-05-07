-- Phase 3: Remote-Setup von Sensoren / Aktoren / Zählern am AICONO Gateway

CREATE TABLE IF NOT EXISTS public.gateway_device_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_device_id uuid NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  integration_type text NOT NULL,           -- 'shelly' | 'mqtt' | 'modbus_tcp' | 'ha_native' | ...
  entity_kind text NOT NULL DEFAULT 'sensor', -- 'meter' | 'sensor' | 'actuator'
  entity_label text NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ha_entity_id text,
  meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  sensor_uuid text,
  actuator_uuid text,
  discovery_method text,                    -- 'mdns' | 'mqtt' | 'modbus_scan' | 'manual'
  provision_status text NOT NULL DEFAULT 'pending', -- 'pending' | 'provisioning' | 'active' | 'error' | 'archived'
  last_error text,
  version integer NOT NULL DEFAULT 1,
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gateway_device_entities REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_gw_dev_entities_device ON public.gateway_device_entities(gateway_device_id);
CREATE INDEX IF NOT EXISTS idx_gw_dev_entities_tenant ON public.gateway_device_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gw_dev_entities_status ON public.gateway_device_entities(provision_status);

ALTER TABLE public.gateway_device_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read entities"
  ON public.gateway_device_entities FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage entities (insert)"
  ON public.gateway_device_entities FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage entities (update)"
  ON public.gateway_device_entities FOR UPDATE
  USING (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage entities (delete)"
  ON public.gateway_device_entities FOR DELETE
  USING (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.bump_gateway_device_entity_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND (NEW.config_json IS DISTINCT FROM OLD.config_json
                        OR NEW.entity_label IS DISTINCT FROM OLD.entity_label
                        OR NEW.provision_status IS DISTINCT FROM OLD.provision_status) THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gateway_device_entity_version
BEFORE INSERT OR UPDATE ON public.gateway_device_entities
FOR EACH ROW EXECUTE FUNCTION public.bump_gateway_device_entity_version();

ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_device_entities;

-- Discovery buffer: results pushed by the gateway
CREATE TABLE IF NOT EXISTS public.gateway_device_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_device_id uuid NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  discovery_method text NOT NULL,           -- 'mdns' | 'mqtt' | 'modbus_scan'
  discovered_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_provisioned boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gw_dev_disc_device ON public.gateway_device_discoveries(gateway_device_id);
CREATE INDEX IF NOT EXISTS idx_gw_dev_disc_tenant ON public.gateway_device_discoveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gw_dev_disc_expires ON public.gateway_device_discoveries(expires_at);

ALTER TABLE public.gateway_device_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read discoveries"
  ON public.gateway_device_discoveries FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage discoveries (insert)"
  ON public.gateway_device_discoveries FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage discoveries (update)"
  ON public.gateway_device_discoveries FOR UPDATE
  USING (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "tenant admins manage discoveries (delete)"
  ON public.gateway_device_discoveries FOR DELETE
  USING (
    (tenant_id = public.get_user_tenant_id() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'gateway.manage')
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_device_discoveries;