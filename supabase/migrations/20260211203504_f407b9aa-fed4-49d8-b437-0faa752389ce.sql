
CREATE TABLE public.location_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  location_integration_id UUID NOT NULL REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  actuator_uuid TEXT NOT NULL,
  actuator_name TEXT NOT NULL,
  actuator_control_type TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'pulse',
  action_value TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.location_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automations for their tenant"
ON public.location_automations FOR SELECT
USING (tenant_id = (SELECT get_user_tenant_id())::uuid);

CREATE POLICY "Users can create automations for their tenant"
ON public.location_automations FOR INSERT
WITH CHECK (tenant_id = (SELECT get_user_tenant_id())::uuid);

CREATE POLICY "Users can update automations for their tenant"
ON public.location_automations FOR UPDATE
USING (tenant_id = (SELECT get_user_tenant_id())::uuid);

CREATE POLICY "Users can delete automations for their tenant"
ON public.location_automations FOR DELETE
USING (tenant_id = (SELECT get_user_tenant_id())::uuid);

CREATE TRIGGER update_location_automations_updated_at
BEFORE UPDATE ON public.location_automations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
