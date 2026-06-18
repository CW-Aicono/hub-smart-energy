GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

GRANT SELECT ON public.location_integrations TO authenticated;
GRANT ALL ON public.location_integrations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_devices TO authenticated;
GRANT ALL ON public.gateway_devices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_release_channels TO authenticated;
GRANT ALL ON public.gateway_release_channels TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_update_jobs TO authenticated;
GRANT ALL ON public.gateway_update_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_commands TO authenticated;
GRANT ALL ON public.gateway_commands TO service_role;