-- =====================================================================
-- Vertriebspartner-Backend: Stufe 1a (Schema + RBAC-Fundament)
-- =====================================================================

-- 1) Neue Rollen
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_user';

-- =====================================================================
-- 2) Tabelle partners
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  logo_url        text,
  primary_color   text,
  contact_email   text,
  contact_phone   text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  subdomain       text UNIQUE,
  custom_domain   text UNIQUE,
  billing_mode    text NOT NULL DEFAULT 'wholesale'
                  CHECK (billing_mode IN ('wholesale','commission','whitelabel_billing')),
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partners_active ON public.partners(is_active);
GRANT SELECT ON public.partners TO authenticated;
GRANT ALL    ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 3) Tabelle partner_members
-- =====================================================================
CREATE TYPE public.partner_member_role AS ENUM ('partner_admin','partner_user');

CREATE TABLE IF NOT EXISTS public.partner_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  partner_role public.partner_member_role NOT NULL DEFAULT 'partner_user',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_members_partner ON public.partner_members(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_members_user    ON public.partner_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_members TO authenticated;
GRANT ALL ON public.partner_members TO service_role;
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_partner_members_updated_at
  BEFORE UPDATE ON public.partner_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4) tenants <-> partner Verknuepfung (VOR Helper-Funktionen!)
-- =====================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS partner_id    uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_owner text NOT NULL DEFAULT 'platform'
    CHECK (support_owner IN ('platform','partner'));

CREATE INDEX IF NOT EXISTS idx_tenants_partner ON public.tenants(partner_id);

COMMENT ON COLUMN public.tenants.partner_id IS
  'Optionaler Vertriebspartner; NULL = AICONO-Direkt-Tenant';
COMMENT ON COLUMN public.tenants.support_owner IS
  'Wer ist Erstkontakt fuer Support: platform (AICONO) oder partner';

-- =====================================================================
-- 5) Helper-Funktionen
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.partner_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_partner_member(_user_id uuid, _partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members
    WHERE user_id = _user_id AND partner_id = _partner_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_partner_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members
    WHERE user_id = _user_id AND partner_role = 'partner_admin'::public.partner_member_role
  )
$$;

CREATE OR REPLACE FUNCTION public.partner_has_tenant_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_members pm
    JOIN public.tenants t ON t.partner_id = pm.partner_id
    WHERE pm.user_id = _user_id
      AND t.id       = _tenant_id
  )
$$;

-- =====================================================================
-- 6) RLS-Policies fuer partners
-- =====================================================================
CREATE POLICY "partners_super_admin_all" ON public.partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "partners_member_select" ON public.partners
  FOR SELECT TO authenticated
  USING (id = public.get_user_partner_id());

CREATE POLICY "partners_admin_update_own" ON public.partners
  FOR UPDATE TO authenticated
  USING (id = public.get_user_partner_id() AND public.is_partner_admin(auth.uid()))
  WITH CHECK (id = public.get_user_partner_id());

CREATE OR REPLACE FUNCTION public.protect_partner_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.slug          IS DISTINCT FROM OLD.slug          THEN RAISE EXCEPTION 'slug only modifiable by super_admin'; END IF;
  IF NEW.subdomain     IS DISTINCT FROM OLD.subdomain     THEN RAISE EXCEPTION 'subdomain only modifiable by super_admin'; END IF;
  IF NEW.custom_domain IS DISTINCT FROM OLD.custom_domain THEN RAISE EXCEPTION 'custom_domain only modifiable by super_admin'; END IF;
  IF NEW.billing_mode  IS DISTINCT FROM OLD.billing_mode  THEN RAISE EXCEPTION 'billing_mode only modifiable by super_admin'; END IF;
  IF NEW.is_active     IS DISTINCT FROM OLD.is_active     THEN RAISE EXCEPTION 'is_active only modifiable by super_admin'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_partners_protect_sensitive
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.protect_partner_sensitive_fields();

-- =====================================================================
-- 7) RLS-Policies fuer partner_members
-- =====================================================================
CREATE POLICY "partner_members_super_admin_all" ON public.partner_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "partner_members_select_same_partner" ON public.partner_members
  FOR SELECT TO authenticated
  USING (partner_id = public.get_user_partner_id());

CREATE POLICY "partner_members_admin_insert_own" ON public.partner_members
  FOR INSERT TO authenticated
  WITH CHECK (partner_id = public.get_user_partner_id() AND public.is_partner_admin(auth.uid()));

CREATE POLICY "partner_members_admin_update_own" ON public.partner_members
  FOR UPDATE TO authenticated
  USING (partner_id = public.get_user_partner_id() AND public.is_partner_admin(auth.uid()))
  WITH CHECK (partner_id = public.get_user_partner_id());

CREATE POLICY "partner_members_admin_delete_own" ON public.partner_members
  FOR DELETE TO authenticated
  USING (partner_id = public.get_user_partner_id() AND public.is_partner_admin(auth.uid()));

-- =====================================================================
-- 8) Privilege-Escalation-Schutz fuer partner_members
-- =====================================================================
CREATE OR REPLACE FUNCTION public.guard_partner_member_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF public.has_role(v_caller, 'super_admin'::public.app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_members
      WHERE user_id = v_caller
        AND partner_id = NEW.partner_id
        AND partner_role = 'partner_admin'::public.partner_member_role
    ) THEN
      RAISE EXCEPTION 'partner_member change requires partner_admin role within target partner';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_members
      WHERE user_id = v_caller
        AND partner_id = OLD.partner_id
        AND partner_role = 'partner_admin'::public.partner_member_role
    ) THEN
      RAISE EXCEPTION 'partner_member delete requires partner_admin role within target partner';
    END IF;
    IF OLD.partner_role = 'partner_admin'::public.partner_member_role THEN
      IF (SELECT count(*) FROM public.partner_members
          WHERE partner_id = OLD.partner_id
            AND partner_role = 'partner_admin'::public.partner_member_role) <= 1 THEN
        RAISE EXCEPTION 'cannot remove the last partner_admin of a partner';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_partner_members_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.partner_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_partner_member_changes();
