
-- Create ocpp_message_log table
CREATE TABLE public.ocpp_message_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_point_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type text,
  raw_message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ocpp_message_log_cp_id ON public.ocpp_message_log (charge_point_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.ocpp_message_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read logs
CREATE POLICY "Authenticated users can read OCPP logs"
ON public.ocpp_message_log FOR SELECT
USING (auth.uid() IS NOT NULL);

-- No insert/update/delete policies for anon/authenticated – only service_role writes

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ocpp_message_log;
