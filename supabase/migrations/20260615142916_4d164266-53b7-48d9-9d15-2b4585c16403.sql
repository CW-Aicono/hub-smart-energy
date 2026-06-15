-- Add granular permissions to partner_members
ALTER TABLE public.partner_members
  ADD COLUMN IF NOT EXISTS can_manage_members  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_branding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_reporting  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_tenants  boolean NOT NULL DEFAULT false;

-- Extend partner_member_can with new permission keys
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
        OR (_permission = 'create_tenant'        AND pm.can_create_tenant)
        OR (_permission = 'view_billing'         AND pm.can_view_billing)
        OR (_permission = 'use_sales_scout'      AND pm.can_use_sales_scout)
        OR (_permission = 'manage_members'       AND pm.can_manage_members)
        OR (_permission = 'manage_branding'      AND pm.can_manage_branding)
        OR (_permission = 'view_reporting'       AND pm.can_view_reporting)
        OR (_permission = 'manage_tenants'       AND pm.can_manage_tenants)
      )
  )
$$;

-- Protect the last partner admin: prevent delete/demote
CREATE OR REPLACE FUNCTION public.prevent_last_partner_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.partner_role <> 'partner_admin'::public.partner_member_role THEN
      RETURN OLD;
    END IF;
    v_partner_id := OLD.partner_id;
    SELECT COUNT(*) INTO v_remaining
      FROM public.partner_members
     WHERE partner_id = v_partner_id
       AND partner_role = 'partner_admin'::public.partner_member_role
       AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'Der letzte Partner-Admin kann nicht entfernt oder herabgestuft werden.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: only relevant if role is changing away from partner_admin
  IF OLD.partner_role = 'partner_admin'::public.partner_member_role
     AND NEW.partner_role <> 'partner_admin'::public.partner_member_role THEN
    SELECT COUNT(*) INTO v_remaining
      FROM public.partner_members
     WHERE partner_id = OLD.partner_id
       AND partner_role = 'partner_admin'::public.partner_member_role
       AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'Der letzte Partner-Admin kann nicht entfernt oder herabgestuft werden.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_partner_admin_del ON public.partner_members;
CREATE TRIGGER trg_prevent_last_partner_admin_del
BEFORE DELETE ON public.partner_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_partner_admin_removal();

DROP TRIGGER IF EXISTS trg_prevent_last_partner_admin_upd ON public.partner_members;
CREATE TRIGGER trg_prevent_last_partner_admin_upd
BEFORE UPDATE ON public.partner_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_partner_admin_removal();
