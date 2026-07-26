REVOKE ALL ON FUNCTION public.gateway_inventory_sensor_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gateway_inventory_sensor_history() FROM anon;
REVOKE ALL ON FUNCTION public.gateway_inventory_sensor_history() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_inventory_sensor_history() TO service_role;