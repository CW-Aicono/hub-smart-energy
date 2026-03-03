
-- Add WebSocket connection tracking fields to charge_points
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS ws_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ws_connected_since timestamptz DEFAULT NULL;
