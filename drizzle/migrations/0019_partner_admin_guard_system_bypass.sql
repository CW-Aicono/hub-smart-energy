CREATE OR REPLACE FUNCTION public.prevent_last_partner_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  -- Systemkontext (Konto-Löschung durch Auth-Dienst/Service) und Portal-Admins dürfen den letzten Partner-Admin entfernen.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.partner_role <> 'partner_admin'::public.partner_member_role THEN
      RETURN OLD;
    END IF;
    SELECT COUNT(*) INTO v_remaining FROM public.partner_members
     WHERE partner_id = OLD.partner_id
       AND partner_role = 'partner_admin'::public.partner_member_role
       AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'Der letzte Partner-Admin kann nicht entfernt oder herabgestuft werden.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.partner_role = 'partner_admin'::public.partner_member_role
     AND NEW.partner_role <> 'partner_admin'::public.partner_member_role THEN
    SELECT COUNT(*) INTO v_remaining FROM public.partner_members
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
REVOKE EXECUTE ON FUNCTION public.prevent_last_partner_admin_removal() FROM PUBLIC, anon, authenticated;