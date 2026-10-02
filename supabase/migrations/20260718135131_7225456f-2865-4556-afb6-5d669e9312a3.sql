
-- Guard functions: STABLE + SECURITY DEFINER so Postgres evaluates once per query,
-- not per row, and short-circuits expensive per-row EXISTS subqueries in RLS.

CREATE OR REPLACE FUNCTION public.is_app_tenant_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants
    WHERE auth_user_id = _user_id
      AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_partner_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members
    WHERE user_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_app_tenant_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid) TO authenticated;

-- Policy #1: App tenants — guard with is_app_tenant_user so the per-row EXISTS
-- only runs for users that actually are app-tenant users.
DROP POLICY IF EXISTS "App tenants can view own meter period totals" ON public.meter_period_totals;
CREATE POLICY "App tenants can view own meter period totals"
ON public.meter_period_totals
FOR SELECT
TO authenticated
USING (
  public.is_app_tenant_user((SELECT auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.meter_id = meter_period_totals.meter_id
      AND tet.auth_user_id = (SELECT auth.uid())
      AND tet.status = 'active'
  )
);

-- Policy #2: Partner members — guard with is_partner_member so
-- partner_has_tenant_access only runs for partner members.
DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.meter_period_totals;
CREATE POLICY "Partner members can read tenant data"
ON public.meter_period_totals
FOR SELECT
TO authenticated
USING (
  public.is_partner_member((SELECT auth.uid()))
  AND public.partner_has_tenant_access((SELECT auth.uid()), tenant_id)
);
