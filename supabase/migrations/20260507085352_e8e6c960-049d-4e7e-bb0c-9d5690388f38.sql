UPDATE public.charge_points
SET status = 'available'
WHERE id = '0e2e8550-083d-4498-9134-7ee40f89410f'
  AND ws_connected = true
  AND status = 'offline';