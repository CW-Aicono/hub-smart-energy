ALTER TABLE public.ocpp_message_log
  ADD COLUMN IF NOT EXISTS response_message jsonb,
  ADD COLUMN IF NOT EXISTS response_at timestamptz;

COMMENT ON COLUMN public.ocpp_message_log.response_message IS 'Gepaarte OCPP-Antwort (CallResult/CallError) zum Request in raw_message. NULL = unbeantwortet / serverseitig initiierter Call ohne Response.';
COMMENT ON COLUMN public.ocpp_message_log.response_at IS 'Zeitstempel, an dem die zugehörige Antwort eingetroffen ist.';