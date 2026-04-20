ALTER TABLE public.gateway_device_inventory REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_device_inventory;