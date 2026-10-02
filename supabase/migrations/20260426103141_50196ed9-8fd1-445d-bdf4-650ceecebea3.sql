-- Tabelle für laufende Simulator-Instanzen
CREATE TABLE public.simulator_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  external_id text,
  ocpp_id text NOT NULL,
  protocol text NOT NULL DEFAULT 'wss' CHECK (protocol IN ('ws','wss')),
  server_host text NOT NULL DEFAULT 'ocpp.aicono.org',
  vendor text NOT NULL DEFAULT 'AICONO',
  model text NOT NULL DEFAULT 'Simulator',
  status text NOT NULL DEFAULT 'connecting',
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_simulator_instances_tenant ON public.simulator_instances(tenant_id);
CREATE INDEX idx_simulator_instances_status ON public.simulator_instances(status);
CREATE UNIQUE INDEX idx_simulator_instances_external_id ON public.simulator_instances(external_id) WHERE external_id IS NOT NULL;

-- updated_at Trigger
CREATE TRIGGER update_simulator_instances_updated_at
BEFORE UPDATE ON public.simulator_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Limit-Trigger: max 3 aktive Instanzen pro Tenant
CREATE OR REPLACE FUNCTION public.enforce_simulator_instance_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.status NOT IN ('stopped','error') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.simulator_instances
    WHERE tenant_id = NEW.tenant_id
      AND status NOT IN ('stopped','error')
      AND id <> NEW.id;
    IF v_count >= 3 THEN
      RAISE EXCEPTION 'Maximal 3 aktive Simulator-Instanzen pro Tenant erlaubt';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_simulator_instance_limit_trigger
BEFORE INSERT OR UPDATE ON public.simulator_instances
FOR EACH ROW EXECUTE FUNCTION public.enforce_simulator_instance_limit();

-- RLS aktivieren — nur Super-Admins
ALTER TABLE public.simulator_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super-Admins können Simulator-Instanzen lesen"
ON public.simulator_instances FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super-Admins können Simulator-Instanzen anlegen"
ON public.simulator_instances FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super-Admins können Simulator-Instanzen ändern"
ON public.simulator_instances FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super-Admins können Simulator-Instanzen löschen"
ON public.simulator_instances FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));