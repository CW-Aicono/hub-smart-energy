-- Add optional OCPP password for charge point authentication
ALTER TABLE public.charge_points
ADD COLUMN IF NOT EXISTS ocpp_password text DEFAULT NULL;

-- Add comment explaining usage
COMMENT ON COLUMN public.charge_points.ocpp_password IS 'Optional password for OCPP Basic Auth. If set, charge points must authenticate with this password via the WebSocket proxy.';
