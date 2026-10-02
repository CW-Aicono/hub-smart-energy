
-- =========================================================
-- P5: partner_module_prices INSERT/UPDATE an view_billing binden
-- =========================================================
DROP POLICY IF EXISTS "partner_module_prices_admin_upsert" ON public.partner_module_prices;
DROP POLICY IF EXISTS "partner_module_prices_admin_update" ON public.partner_module_prices;

CREATE POLICY "partner_module_prices_billing_insert"
  ON public.partner_module_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'view_billing')
  );

CREATE POLICY "partner_module_prices_billing_update"
  ON public.partner_module_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'view_billing')
  )
  WITH CHECK (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'view_billing')
  );

CREATE POLICY "partner_module_prices_billing_delete"
  ON public.partner_module_prices
  FOR DELETE
  TO authenticated
  USING (
    public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'view_billing')
  );

-- =========================================================
-- P1: Partner-Admins dürfen eigene partners-Zeile updaten
--      (sensible Felder via Trigger geschützt)
-- =========================================================
CREATE OR REPLACE FUNCTION public.partners_guard_partner_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean := public.has_role(auth.uid(), 'super_admin'::public.app_role);
BEGIN
  IF v_is_super OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.slug              IS DISTINCT FROM OLD.slug
     OR NEW.subdomain      IS DISTINCT FROM OLD.subdomain
     OR NEW.custom_domain  IS DISTINCT FROM OLD.custom_domain
     OR NEW.white_label_enabled IS DISTINCT FROM OLD.white_label_enabled
     OR NEW.billing_mode   IS DISTINCT FROM OLD.billing_mode
     OR NEW.commission_pct IS DISTINCT FROM OLD.commission_pct
     OR NEW.is_active      IS DISTINCT FROM OLD.is_active
     OR NEW.ai_analysis_mode IS DISTINCT FROM OLD.ai_analysis_mode
     OR NEW.billing_address IS DISTINCT FROM OLD.billing_address
  THEN
    RAISE EXCEPTION 'Partner-Admin darf dieses Feld nicht ändern. Bitte Super-Admin kontaktieren.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_guard_partner_admin_update ON public.partners;
CREATE TRIGGER trg_partners_guard_partner_admin_update
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.partners_guard_partner_admin_update();

DROP POLICY IF EXISTS "partners_partner_admin_self_update" ON public.partners;
CREATE POLICY "partners_partner_admin_self_update"
  ON public.partners
  FOR UPDATE
  TO authenticated
  USING (public.is_partner_admin(auth.uid()) AND id = public.get_user_partner_id())
  WITH CHECK (public.is_partner_admin(auth.uid()) AND id = public.get_user_partner_id());

-- =========================================================
-- P1: Storage – Partner-Admin darf eigenen Pfad im partner-assets Bucket pflegen
-- =========================================================
DROP POLICY IF EXISTS "partner_assets_partner_admin_write" ON storage.objects;
CREATE POLICY "partner_assets_partner_admin_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-assets'
    AND public.is_partner_admin(auth.uid())
    AND split_part(name, '/', 1) = public.get_user_partner_id()::text
  );

DROP POLICY IF EXISTS "partner_assets_partner_admin_update" ON storage.objects;
CREATE POLICY "partner_assets_partner_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-assets'
    AND public.is_partner_admin(auth.uid())
    AND split_part(name, '/', 1) = public.get_user_partner_id()::text
  );

DROP POLICY IF EXISTS "partner_assets_partner_admin_delete" ON storage.objects;
CREATE POLICY "partner_assets_partner_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'partner-assets'
    AND public.is_partner_admin(auth.uid())
    AND split_part(name, '/', 1) = public.get_user_partner_id()::text
  );

-- =========================================================
-- P3: Tenant-Stammdaten durch Partner-Admin (create_tenant Permission)
--      bearbeitbar; sensible Felder via Trigger blockiert.
-- =========================================================
CREATE OR REPLACE FUNCTION public.tenants_guard_partner_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean := public.has_role(auth.uid(), 'super_admin'::public.app_role);
  v_is_tenant_admin boolean := false;
BEGIN
  IF v_is_super OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Wenn Aufrufer eigener Tenant-Admin ist (klassische Self-Service-Pflege), nicht beschneiden
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND p.tenant_id = NEW.id
      AND ur.role = 'admin'::public.app_role
  ) INTO v_is_tenant_admin;

  IF v_is_tenant_admin THEN
    RETURN NEW;
  END IF;

  -- Partner-Admin-Pfad: nur ausgewählte Felder erlaubt
  IF NEW.status               IS DISTINCT FROM OLD.status
     OR NEW.suspended_at      IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason  IS DISTINCT FROM OLD.suspended_reason
     OR NEW.deleted_at        IS DISTINCT FROM OLD.deleted_at
     OR NEW.partner_id        IS DISTINCT FROM OLD.partner_id
     OR NEW.support_owner     IS DISTINCT FROM OLD.support_owner
     OR NEW.payment_method    IS DISTINCT FROM OLD.payment_method
     OR NEW.sepa_iban         IS DISTINCT FROM OLD.sepa_iban
     OR NEW.sepa_bic          IS DISTINCT FROM OLD.sepa_bic
     OR NEW.sepa_mandate_ref  IS DISTINCT FROM OLD.sepa_mandate_ref
     OR NEW.sepa_mandate_date IS DISTINCT FROM OLD.sepa_mandate_date
     OR NEW.sepa_account_holder IS DISTINCT FROM OLD.sepa_account_holder
     OR NEW.lexware_contact_id IS DISTINCT FROM OLD.lexware_contact_id
     OR NEW.is_aicono_member  IS DISTINCT FROM OLD.is_aicono_member
     OR NEW.support_price_per_15min IS DISTINCT FROM OLD.support_price_per_15min
     OR NEW.slug              IS DISTINCT FROM OLD.slug
     OR NEW.tenant_type       IS DISTINCT FROM OLD.tenant_type
     OR NEW.is_kommune        IS DISTINCT FROM OLD.is_kommune
  THEN
    RAISE EXCEPTION 'Partner-Admin darf dieses Tenant-Feld nicht ändern. Bitte Super-Admin kontaktieren.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_guard_partner_admin_update ON public.tenants;
CREATE TRIGGER trg_tenants_guard_partner_admin_update
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tenants_guard_partner_admin_update();

DROP POLICY IF EXISTS "Partner admins can update own tenants" ON public.tenants;
CREATE POLICY "Partner admins can update own tenants"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IS NOT NULL
    AND public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'create_tenant')
  )
  WITH CHECK (
    partner_id IS NOT NULL
    AND public.is_partner_member(auth.uid(), partner_id)
    AND public.partner_member_can(auth.uid(), 'create_tenant')
  );

-- =========================================================
-- P2: Reporting-RPCs (Partner-Scope, Super-Admin überall)
-- =========================================================
CREATE OR REPLACE FUNCTION public.partner_reporting_overview(_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_active int := 0;
  v_suspended int := 0;
  v_deleted int := 0;
  v_new_30d int := 0;
  v_mrr numeric := 0;
  v_modules_active int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.is_partner_member(auth.uid(), _partner_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'active'),
    count(*) FILTER (WHERE status = 'suspended'),
    count(*) FILTER (WHERE status = 'deleted'),
    count(*) FILTER (WHERE created_at >= now() - interval '30 days')
  INTO v_total, v_active, v_suspended, v_deleted, v_new_30d
  FROM public.tenants
  WHERE partner_id = _partner_id;

  SELECT COALESCE(SUM(price_monthly), 0)
  INTO v_mrr
  FROM public.tenant_licenses tl
  JOIN public.tenants t ON t.id = tl.tenant_id
  WHERE t.partner_id = _partner_id
    AND tl.status = 'active'
    AND t.status = 'active';

  SELECT count(*)
  INTO v_modules_active
  FROM public.tenant_modules tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE t.partner_id = _partner_id
    AND tm.is_enabled = true
    AND t.status = 'active';

  RETURN jsonb_build_object(
    'tenants_total', v_total,
    'tenants_active', v_active,
    'tenants_suspended', v_suspended,
    'tenants_deleted', v_deleted,
    'tenants_new_30d', v_new_30d,
    'mrr_eur', v_mrr,
    'modules_active', v_modules_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_reporting_growth(_partner_id uuid)
RETURNS TABLE(month_start date, tenants_total int, mrr_eur numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.is_partner_member(auth.uid(), _partner_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now() - interval '11 months')::date,
      date_trunc('month', now())::date,
      interval '1 month'
    )::date AS m
  )
  SELECT
    months.m AS month_start,
    (SELECT count(*)::int FROM public.tenants t
       WHERE t.partner_id = _partner_id
         AND t.created_at < (months.m + interval '1 month')
         AND (t.status <> 'deleted' OR t.deleted_at >= (months.m + interval '1 month'))
    ) AS tenants_total,
    COALESCE((
      SELECT SUM(tl.price_monthly) FROM public.tenant_licenses tl
      JOIN public.tenants t ON t.id = tl.tenant_id
      WHERE t.partner_id = _partner_id
        AND tl.status = 'active'
        AND tl.valid_from < (months.m + interval '1 month')
        AND (tl.valid_until IS NULL OR tl.valid_until >= months.m)
    ), 0)::numeric AS mrr_eur
  FROM months
  ORDER BY months.m;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_reporting_modules(_partner_id uuid)
RETURNS TABLE(module_code text, tenants_count int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.is_partner_member(auth.uid(), _partner_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT tm.module_code, count(DISTINCT tm.tenant_id)::int
  FROM public.tenant_modules tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE t.partner_id = _partner_id
    AND tm.is_enabled = true
    AND t.status = 'active'
  GROUP BY tm.module_code
  ORDER BY count(DISTINCT tm.tenant_id) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_reporting_overview(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.partner_reporting_growth(uuid)   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.partner_reporting_modules(uuid)  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.partner_reporting_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_reporting_growth(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_reporting_modules(uuid)  TO authenticated, service_role;
