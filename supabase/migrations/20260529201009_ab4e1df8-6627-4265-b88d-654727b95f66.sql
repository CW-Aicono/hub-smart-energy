REVOKE ALL ON FUNCTION public.can_manage_tenant_asset_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_tenant_asset_path(text) FROM anon;
REVOKE ALL ON FUNCTION public.can_manage_charge_point_photo_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_charge_point_photo_path(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_tenant_asset_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_charge_point_photo_path(text) TO authenticated, service_role;