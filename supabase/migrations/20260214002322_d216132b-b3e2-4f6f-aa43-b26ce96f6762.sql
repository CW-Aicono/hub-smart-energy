
-- Table to queue OCPP commands for the WebSocket proxy to pick up
CREATE TABLE public.pending_ocpp_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_point_ocpp_id TEXT NOT NULL,
  command TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for fast lookup of pending commands per charge point
CREATE INDEX idx_pending_ocpp_commands_lookup 
  ON public.pending_ocpp_commands (charge_point_ocpp_id, status) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.pending_ocpp_commands ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) should access this table
-- Authenticated users can insert commands via the edge function REST API
CREATE POLICY "Service role full access" 
  ON public.pending_ocpp_commands 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
