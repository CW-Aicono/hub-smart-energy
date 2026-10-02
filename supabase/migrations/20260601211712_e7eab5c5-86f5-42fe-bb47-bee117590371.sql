
-- ============================================================
-- 1. device_catalog: Ownership-Felder
-- ============================================================
ALTER TABLE public.device_catalog
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_scope text NOT NULL DEFAULT 'global';

ALTER TABLE public.device_catalog
  DROP CONSTRAINT IF EXISTS device_catalog_owner_scope_check;
ALTER TABLE public.device_catalog
  ADD CONSTRAINT device_catalog_owner_scope_check
    CHECK (owner_scope IN ('global','partner'));

ALTER TABLE public.device_catalog
  DROP CONSTRAINT IF EXISTS device_catalog_scope_partner_consistency;
ALTER TABLE public.device_catalog
  ADD CONSTRAINT device_catalog_scope_partner_consistency
    CHECK (
      (owner_scope = 'global' AND partner_id IS NULL) OR
      (owner_scope = 'partner' AND partner_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_device_catalog_partner ON public.device_catalog(partner_id);
CREATE INDEX IF NOT EXISTS idx_device_catalog_scope ON public.device_catalog(owner_scope);

-- ============================================================
-- 2. device_compatibility: Ownership-Felder
-- ============================================================
ALTER TABLE public.device_compatibility
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_scope text NOT NULL DEFAULT 'global';

ALTER TABLE public.device_compatibility
  DROP CONSTRAINT IF EXISTS device_compatibility_owner_scope_check;
ALTER TABLE public.device_compatibility
  ADD CONSTRAINT device_compatibility_owner_scope_check
    CHECK (owner_scope IN ('global','partner'));

ALTER TABLE public.device_compatibility
  DROP CONSTRAINT IF EXISTS device_compatibility_scope_partner_consistency;
ALTER TABLE public.device_compatibility
  ADD CONSTRAINT device_compatibility_scope_partner_consistency
    CHECK (
      (owner_scope = 'global' AND partner_id IS NULL) OR
      (owner_scope = 'partner' AND partner_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_device_compat_partner ON public.device_compatibility(partner_id);

-- ============================================================
-- 3. device_selection_rules: Ownership-Felder
-- ============================================================
ALTER TABLE public.device_selection_rules
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_scope text NOT NULL DEFAULT 'global';

ALTER TABLE public.device_selection_rules
  DROP CONSTRAINT IF EXISTS device_selection_rules_owner_scope_check;
ALTER TABLE public.device_selection_rules
  ADD CONSTRAINT device_selection_rules_owner_scope_check
    CHECK (owner_scope IN ('global','partner'));

CREATE INDEX IF NOT EXISTS idx_device_selection_rules_partner ON public.device_selection_rules(partner_id);

-- ============================================================
-- 4. Partner-Preis-Overrides für globale Artikel
-- ============================================================
CREATE TABLE IF NOT EXISTS public.device_catalog_partner_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_catalog_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  ek_preis numeric(10,2),
  vk_preis numeric(10,2),
  installations_pauschale numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_catalog_id, partner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_catalog_partner_pricing TO authenticated;
GRANT ALL ON public.device_catalog_partner_pricing TO service_role;

ALTER TABLE public.device_catalog_partner_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner members can view their pricing"
  ON public.device_catalog_partner_pricing
  FOR SELECT
  TO authenticated
  USING (
    public.is_partner_member(auth.uid(), partner_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Partner admins manage their pricing"
  ON public.device_catalog_partner_pricing
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_catalog_partner_pricing.partner_id
        AND pm.partner_role = 'partner_admin'::public.partner_member_role
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_catalog_partner_pricing.partner_id
        AND pm.partner_role = 'partner_admin'::public.partner_member_role
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE TRIGGER trg_device_catalog_partner_pricing_updated_at
  BEFORE UPDATE ON public.device_catalog_partner_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. partner_members: granulare Berechtigungen
-- ============================================================
ALTER TABLE public.partner_members
  ADD COLUMN IF NOT EXISTS can_manage_sales_catalog boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_tenant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_use_sales_scout boolean NOT NULL DEFAULT true;

-- partner_admins erhalten automatisch alle Rechte
UPDATE public.partner_members
SET can_manage_sales_catalog = true,
    can_create_tenant = true,
    can_view_billing = true,
    can_use_sales_scout = true
WHERE partner_role = 'partner_admin'::public.partner_member_role;

-- Helper-Funktion: Berechtigung des aktuellen Users
CREATE OR REPLACE FUNCTION public.partner_member_can(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members pm
    WHERE pm.user_id = _user_id
      AND (
        pm.partner_role = 'partner_admin'::public.partner_member_role
        OR (_permission = 'manage_sales_catalog' AND pm.can_manage_sales_catalog)
        OR (_permission = 'create_tenant' AND pm.can_create_tenant)
        OR (_permission = 'view_billing' AND pm.can_view_billing)
        OR (_permission = 'use_sales_scout' AND pm.can_use_sales_scout)
      )
  )
$$;

-- ============================================================
-- 6. RLS auf device_catalog / device_compatibility / rules
-- ============================================================
-- Bestehende Policies droppen (sofern vorhanden) und neu setzen
DROP POLICY IF EXISTS "Authenticated can view active catalog" ON public.device_catalog;
DROP POLICY IF EXISTS "Super admins manage catalog" ON public.device_catalog;
DROP POLICY IF EXISTS "View catalog" ON public.device_catalog;
DROP POLICY IF EXISTS "Manage catalog" ON public.device_catalog;

CREATE POLICY "View catalog"
  ON public.device_catalog
  FOR SELECT
  TO authenticated
  USING (
    (owner_scope = 'global' AND is_active = true)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (owner_scope = 'partner' AND public.is_partner_member(auth.uid(), partner_id))
  );

CREATE POLICY "Super admin manage global catalog"
  ON public.device_catalog
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Partner manages own catalog"
  ON public.device_catalog
  FOR ALL
  TO authenticated
  USING (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_catalog.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  )
  WITH CHECK (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_catalog.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  );

-- device_compatibility
DROP POLICY IF EXISTS "Authenticated can view compatibility" ON public.device_compatibility;
DROP POLICY IF EXISTS "Super admins manage compatibility" ON public.device_compatibility;
DROP POLICY IF EXISTS "View compatibility" ON public.device_compatibility;
DROP POLICY IF EXISTS "Manage compatibility" ON public.device_compatibility;

CREATE POLICY "View compatibility"
  ON public.device_compatibility
  FOR SELECT
  TO authenticated
  USING (
    owner_scope = 'global'
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (owner_scope = 'partner' AND public.is_partner_member(auth.uid(), partner_id))
  );

CREATE POLICY "Super admin manage global compatibility"
  ON public.device_compatibility
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Partner manages own compatibility"
  ON public.device_compatibility
  FOR ALL
  TO authenticated
  USING (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_compatibility.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  )
  WITH CHECK (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_compatibility.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  );

-- device_selection_rules
DROP POLICY IF EXISTS "Authenticated can view active rules" ON public.device_selection_rules;
DROP POLICY IF EXISTS "Super admins manage rules" ON public.device_selection_rules;
DROP POLICY IF EXISTS "View rules" ON public.device_selection_rules;
DROP POLICY IF EXISTS "Manage rules" ON public.device_selection_rules;

CREATE POLICY "View rules"
  ON public.device_selection_rules
  FOR SELECT
  TO authenticated
  USING (
    (owner_scope = 'global' AND is_active = true)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (owner_scope = 'partner' AND public.is_partner_member(auth.uid(), partner_id))
  );

CREATE POLICY "Super admin manage global rules"
  ON public.device_selection_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Partner manages own rules"
  ON public.device_selection_rules
  FOR ALL
  TO authenticated
  USING (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_selection_rules.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  )
  WITH CHECK (
    owner_scope = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.partner_id = device_selection_rules.partner_id
        AND (pm.partner_role = 'partner_admin'::public.partner_member_role
             OR pm.can_manage_sales_catalog = true)
    )
  );
