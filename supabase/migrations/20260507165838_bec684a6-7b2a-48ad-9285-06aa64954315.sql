
-- ============================================================
-- 1. wallbox_modbus_templates
-- ============================================================
CREATE TABLE public.wallbox_modbus_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor text NOT NULL,
  model text NOT NULL,
  firmware_min text,
  firmware_max text,
  default_unit_id integer NOT NULL DEFAULT 1,
  default_port integer NOT NULL DEFAULT 502,
  read_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  write_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  poll_intervals jsonb NOT NULL DEFAULT '{"fast_ms": 3000, "slow_ms": 30000}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, model)
);

CREATE INDEX idx_wallbox_modbus_templates_vendor ON public.wallbox_modbus_templates (vendor, model);

ALTER TABLE public.wallbox_modbus_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read templates"
  ON public.wallbox_modbus_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert templates"
  ON public.wallbox_modbus_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update templates"
  ON public.wallbox_modbus_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete templates"
  ON public.wallbox_modbus_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.bump_wallbox_template_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND (
    NEW.read_map IS DISTINCT FROM OLD.read_map
    OR NEW.write_map IS DISTINCT FROM OLD.write_map
    OR NEW.status_map IS DISTINCT FROM OLD.status_map
    OR NEW.poll_intervals IS DISTINCT FROM OLD.poll_intervals
  ) THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallbox_template_version
BEFORE INSERT OR UPDATE ON public.wallbox_modbus_templates
FOR EACH ROW EXECUTE FUNCTION public.bump_wallbox_template_version();

-- ============================================================
-- 2. wallbox_modbus_instances
-- ============================================================
CREATE TABLE public.wallbox_modbus_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  gateway_id uuid REFERENCES public.gateway_devices(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES public.wallbox_modbus_templates(id) ON DELETE RESTRICT,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  label text,
  modbus_host text NOT NULL,
  modbus_port integer NOT NULL DEFAULT 502,
  unit_id integer NOT NULL DEFAULT 1,
  provision_status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_seen_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallbox_modbus_instances_tenant ON public.wallbox_modbus_instances (tenant_id);
CREATE INDEX idx_wallbox_modbus_instances_gateway ON public.wallbox_modbus_instances (gateway_id);
CREATE INDEX idx_wallbox_modbus_instances_cp ON public.wallbox_modbus_instances (charge_point_id);

ALTER TABLE public.wallbox_modbus_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own wallbox instances"
  ON public.wallbox_modbus_instances FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Tenant gateway admins insert wallbox instances"
  ON public.wallbox_modbus_instances FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_permission(auth.uid(), 'gateway.manage')
  );

CREATE POLICY "Tenant gateway admins update wallbox instances"
  ON public.wallbox_modbus_instances FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_permission(auth.uid(), 'gateway.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_permission(auth.uid(), 'gateway.manage')
  );

CREATE POLICY "Tenant gateway admins delete wallbox instances"
  ON public.wallbox_modbus_instances FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_permission(auth.uid(), 'gateway.manage')
  );

CREATE OR REPLACE FUNCTION public.bump_wallbox_instance_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND (
    NEW.modbus_host IS DISTINCT FROM OLD.modbus_host
    OR NEW.modbus_port IS DISTINCT FROM OLD.modbus_port
    OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
  ) THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallbox_instance_version
BEFORE INSERT OR UPDATE ON public.wallbox_modbus_instances
FOR EACH ROW EXECUTE FUNCTION public.bump_wallbox_instance_version();

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallbox_modbus_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallbox_modbus_templates;

-- ============================================================
-- 3. Seed templates (super-admin owned, tenant_id is irrelevant)
-- ============================================================

-- Mennekes Amtron Charge Control (vollständig, aktiv)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, poll_intervals, is_active, notes)
VALUES (
  'Mennekes',
  'Amtron Charge Control',
  255,
  502,
  '[
    {"address": 100, "function_code": 4, "data_type": "uint16",  "scale": 1,    "target_field": "vendor_status",  "poll_group": "fast"},
    {"address": 122, "function_code": 4, "data_type": "uint32",  "byte_order": "big", "scale": 1, "target_field": "power_total_w", "poll_group": "fast"},
    {"address": 124, "function_code": 4, "data_type": "uint32",  "byte_order": "big", "scale": 0.001, "target_field": "energy_total_kwh", "poll_group": "slow"},
    {"address": 130, "function_code": 4, "data_type": "uint16",  "scale": 0.1,  "target_field": "current_l1_a",   "poll_group": "fast"},
    {"address": 131, "function_code": 4, "data_type": "uint16",  "scale": 0.1,  "target_field": "current_l2_a",   "poll_group": "fast"},
    {"address": 132, "function_code": 4, "data_type": "uint16",  "scale": 0.1,  "target_field": "current_l3_a",   "poll_group": "fast"},
    {"address": 206, "function_code": 4, "data_type": "uint16",  "scale": 1,    "target_field": "set_current_a",  "poll_group": "slow"}
  ]'::jsonb,
  '{
    "set_current":   {"address": 1000, "function_code": 6, "data_type": "uint16", "scale": 1, "min": 6, "max": 32, "unit": "A"},
    "start_charge":  {"address": 1004, "function_code": 6, "data_type": "uint16", "value": 1},
    "stop_charge":   {"address": 1004, "function_code": 6, "data_type": "uint16", "value": 0}
  }'::jsonb,
  '{
    "1": "Available",
    "2": "Preparing",
    "3": "Charging",
    "4": "SuspendedEVSE",
    "5": "SuspendedEV",
    "6": "Finishing",
    "7": "Reserved",
    "8": "Unavailable",
    "9": "Faulted"
  }'::jsonb,
  '{"fast_ms": 3000, "slow_ms": 30000}'::jsonb,
  true,
  'Holding/Input Register laut Mennekes Modbus-TCP-Spec. Unit-ID = 255 ist Standard.'
);

-- KEBA KeContact P30 (Stub)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, is_active, notes)
VALUES (
  'KEBA',
  'KeContact P30 c/x-Series',
  1, 502,
  '[
    {"address": 1000, "function_code": 3, "data_type": "uint16",  "target_field": "vendor_status", "poll_group": "fast"},
    {"address": 1020, "function_code": 3, "data_type": "uint32",  "byte_order": "big", "scale": 0.001, "target_field": "power_total_w", "poll_group": "fast"},
    {"address": 1036, "function_code": 3, "data_type": "uint32",  "byte_order": "big", "scale": 0.1, "target_field": "energy_total_kwh", "poll_group": "slow"}
  ]'::jsonb,
  '{
    "set_current":  {"address": 5004, "function_code": 6, "data_type": "uint16", "scale": 1000, "min": 6, "max": 32, "unit": "A", "note": "KEBA expects mA"},
    "start_charge": {"address": 5014, "function_code": 6, "data_type": "uint16", "value": 1},
    "stop_charge":  {"address": 5014, "function_code": 6, "data_type": "uint16", "value": 0}
  }'::jsonb,
  '{"0":"Available","1":"Available","2":"Preparing","3":"Charging","4":"Finishing","5":"Faulted"}'::jsonb,
  false,
  'Stub: KeContact P30 Modbus-TCP DSR-Mapping muss vor Produktiv-Einsatz validiert werden.'
);

-- ABB Terra AC (Stub)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, is_active, notes)
VALUES (
  'ABB',
  'Terra AC W-Series',
  1, 502,
  '[
    {"address": 1, "function_code": 3, "data_type": "uint16", "target_field": "vendor_status", "poll_group": "fast"}
  ]'::jsonb,
  '{
    "set_current": {"address": 4001, "function_code": 6, "data_type": "uint16", "min": 6, "max": 32, "unit": "A"}
  }'::jsonb,
  '{"1":"Available","2":"Preparing","3":"Charging","4":"Finishing","9":"Faulted"}'::jsonb,
  false,
  'Stub: ABB Terra AC Modbus-Map muss aus offizieller Doku ergänzt werden.'
);

-- Alfen Eve (Stub)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, is_active, notes)
VALUES (
  'Alfen',
  'Eve Single / Pro-line',
  1, 502,
  '[
    {"address": 1201, "function_code": 4, "data_type": "string", "length": 5, "target_field": "vendor_status_str", "poll_group": "fast"},
    {"address": 344,  "function_code": 4, "data_type": "float32","byte_order": "big", "target_field": "power_total_w", "poll_group": "fast"},
    {"address": 374,  "function_code": 4, "data_type": "float64","byte_order": "big", "target_field": "energy_total_kwh", "poll_group": "slow"}
  ]'::jsonb,
  '{
    "set_current": {"address": 1210, "function_code": 16, "data_type": "float32", "min": 6, "max": 32, "unit": "A"}
  }'::jsonb,
  '{"A":"Available","B1":"Preparing","B2":"Preparing","C1":"SuspendedEV","C2":"Charging","D2":"Charging","E":"Faulted","F":"Faulted"}'::jsonb,
  false,
  'Stub: Alfen SCN-fähig, Modbus-Map laut Alfen Modbus TCP/IP doc validieren.'
);

-- go-e Charger HOMEfix (Stub - nutzt eigentlich HTTP-API)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, is_active, notes)
VALUES (
  'go-e',
  'Charger HOMEfix',
  200, 502,
  '[
    {"address": 100, "function_code": 4, "data_type": "uint16", "target_field": "vendor_status", "poll_group": "fast"}
  ]'::jsonb,
  '{
    "set_current": {"address": 200, "function_code": 6, "data_type": "uint16", "min": 6, "max": 32, "unit": "A"}
  }'::jsonb,
  '{"1":"Available","2":"Preparing","3":"Charging","4":"Finishing","5":"Faulted"}'::jsonb,
  false,
  'Stub: go-e bevorzugt HTTP/MQTT v2 API. Modbus-Slave nur in neueren Firmwares verfügbar.'
);

-- Webasto Live / Next (Stub)
INSERT INTO public.wallbox_modbus_templates
  (vendor, model, default_unit_id, default_port, read_map, write_map, status_map, is_active, notes)
VALUES (
  'Webasto',
  'Live / Next',
  255, 502,
  '[
    {"address": 100, "function_code": 4, "data_type": "uint16", "target_field": "vendor_status", "poll_group": "fast"},
    {"address": 120, "function_code": 4, "data_type": "uint32", "byte_order": "big", "target_field": "power_total_w", "poll_group": "fast"}
  ]'::jsonb,
  '{
    "set_current": {"address": 1000, "function_code": 6, "data_type": "uint16", "min": 6, "max": 32, "unit": "A"}
  }'::jsonb,
  '{"65":"Available","66":"Preparing","67":"Charging","68":"Finishing","70":"Faulted"}'::jsonb,
  false,
  'Stub: Webasto Live/Next Modbus-Map laut Hersteller-Doku validieren.'
);
