
-- 1) Access settings on individual charge points (same structure as groups)
ALTER TABLE public.charge_points
ADD COLUMN IF NOT EXISTS access_settings jsonb NOT NULL DEFAULT '{"free_charging": false, "user_group_restriction": false, "max_charging_duration_min": 480}'::jsonb;

-- 2) Allowed user groups for charge point GROUPS
CREATE TABLE public.charge_point_group_allowed_user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.charge_point_groups(id) ON DELETE CASCADE,
  user_group_id uuid NOT NULL REFERENCES public.charging_user_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_group_id)
);

ALTER TABLE public.charge_point_group_allowed_user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allowed user groups in their tenant"
  ON public.charge_point_group_allowed_user_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.charge_point_groups g
    WHERE g.id = charge_point_group_allowed_user_groups.group_id
      AND g.tenant_id = get_user_tenant_id()
  ));

CREATE POLICY "Admins can manage allowed user groups"
  ON public.charge_point_group_allowed_user_groups FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
      SELECT 1 FROM public.charge_point_groups g
      WHERE g.id = charge_point_group_allowed_user_groups.group_id
        AND g.tenant_id = get_user_tenant_id()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
      SELECT 1 FROM public.charge_point_groups g
      WHERE g.id = charge_point_group_allowed_user_groups.group_id
        AND g.tenant_id = get_user_tenant_id()
    )
  );

-- 3) Allowed user groups for individual charge points
CREATE TABLE public.charge_point_allowed_user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  user_group_id uuid NOT NULL REFERENCES public.charging_user_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (charge_point_id, user_group_id)
);

ALTER TABLE public.charge_point_allowed_user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view charge point allowed user groups in their tenant"
  ON public.charge_point_allowed_user_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.charge_points cp
    WHERE cp.id = charge_point_allowed_user_groups.charge_point_id
      AND cp.tenant_id = get_user_tenant_id()
  ));

CREATE POLICY "Admins can manage charge point allowed user groups"
  ON public.charge_point_allowed_user_groups FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
      SELECT 1 FROM public.charge_points cp
      WHERE cp.id = charge_point_allowed_user_groups.charge_point_id
        AND cp.tenant_id = get_user_tenant_id()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
      SELECT 1 FROM public.charge_points cp
      WHERE cp.id = charge_point_allowed_user_groups.charge_point_id
        AND cp.tenant_id = get_user_tenant_id()
    )
  );
