
-- Create charge_point_groups table
CREATE TABLE public.charge_point_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Energy management settings (stored as JSONB for future extensibility)
  energy_settings JSONB NOT NULL DEFAULT '{
    "dynamic_load_management": false,
    "power_limit_kw": null,
    "pv_surplus_charging": false,
    "scheduled_availability": false,
    "cheap_charging_mode": false
  }'::jsonb,
  -- Access control settings
  access_settings JSONB NOT NULL DEFAULT '{
    "free_charging": false,
    "user_group_restriction": false,
    "max_charging_duration_min": 480
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.charge_point_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view charge point groups in their tenant"
  ON public.charge_point_groups FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert charge point groups"
  ON public.charge_point_groups FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update charge point groups"
  ON public.charge_point_groups FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete charge point groups"
  ON public.charge_point_groups FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Add group_id to charge_points table
ALTER TABLE public.charge_points
  ADD COLUMN group_id UUID REFERENCES public.charge_point_groups(id) ON DELETE SET NULL;

-- updated_at trigger
CREATE TRIGGER update_charge_point_groups_updated_at
  BEFORE UPDATE ON public.charge_point_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
