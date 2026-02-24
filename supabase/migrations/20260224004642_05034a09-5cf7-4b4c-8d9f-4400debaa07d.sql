
-- Add expires_at column so sessions auto-expire after 15 minutes
ALTER TABLE public.support_sessions
ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');

-- Backfill existing rows
UPDATE public.support_sessions
SET expires_at = started_at + interval '15 minutes'
WHERE expires_at IS NULL OR expires_at = now() + interval '15 minutes';

-- Enable realtime so tenant users see changes immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_sessions;
