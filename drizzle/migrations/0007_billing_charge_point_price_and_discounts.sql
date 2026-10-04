ALTER TABLE public.module_prices ADD COLUMN IF NOT EXISTS charge_point_price_monthly numeric NOT NULL DEFAULT 0;
ALTER TABLE public.module_prices ADD COLUMN IF NOT EXISTS industry_charge_point_price_monthly numeric NOT NULL DEFAULT 0;
ALTER TABLE public.tenant_modules ADD COLUMN IF NOT EXISTS charge_point_price_override numeric;

CREATE TABLE IF NOT EXISTS public.tenant_module_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','absolute')),
  value numeric NOT NULL CHECK (value > 0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tmd_percent_max CHECK (discount_type <> 'percent' OR value <= 100),
  CONSTRAINT tmd_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_tmd_tenant ON public.tenant_module_discounts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_module_discounts TO authenticated;
GRANT ALL ON public.tenant_module_discounts TO service_role;
ALTER TABLE public.tenant_module_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tmd_super_admin_all ON public.tenant_module_discounts;
CREATE POLICY tmd_super_admin_all ON public.tenant_module_discounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS tmd_partner_select ON public.tenant_module_discounts;
CREATE POLICY tmd_partner_select ON public.tenant_module_discounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.partner_id IS NOT NULL AND public.is_partner_member(auth.uid(), t.partner_id)));

DROP POLICY IF EXISTS tmd_tenant_admin_select ON public.tenant_module_discounts;
CREATE POLICY tmd_tenant_admin_select ON public.tenant_module_discounts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- Aktive Ladepunkte je Mandant (Heartbeat seit p_since); nur für berechtigte Aufrufer
CREATE OR REPLACE FUNCTION public.get_active_charge_point_counts(p_since timestamptz DEFAULT now() - interval '30 days')
RETURNS TABLE(tenant_id uuid, active_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cp.tenant_id, count(*)::bigint
  FROM public.charge_points cp
  JOIN public.tenants t ON t.id = cp.tenant_id
  WHERE cp.last_heartbeat >= p_since
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR (t.partner_id IS NOT NULL AND public.is_partner_member(auth.uid(), t.partner_id))
      OR cp.tenant_id = public.get_user_tenant_id()
    )
  GROUP BY cp.tenant_id
$$;
REVOKE ALL ON FUNCTION public.get_active_charge_point_counts(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_charge_point_counts(timestamptz) TO authenticated, service_role;