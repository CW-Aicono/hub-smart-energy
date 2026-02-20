
-- Add scheduled_at column for deferred commands (e.g. max charging duration auto-stop)
ALTER TABLE public.pending_ocpp_commands
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.pending_ocpp_commands.scheduled_at IS 'If set, the command should not be executed before this timestamp. Used for max charging duration enforcement.';
