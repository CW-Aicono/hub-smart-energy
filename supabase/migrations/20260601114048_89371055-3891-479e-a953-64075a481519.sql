REVOKE EXECUTE ON FUNCTION public.get_user_partner_id()                       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid)               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_partner_admin(uuid)                      FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.partner_has_tenant_access(uuid, uuid)       FROM anon, public;

GRANT  EXECUTE ON FUNCTION public.get_user_partner_id()                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid)               TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_partner_admin(uuid)                      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.partner_has_tenant_access(uuid, uuid)       TO authenticated, service_role;
