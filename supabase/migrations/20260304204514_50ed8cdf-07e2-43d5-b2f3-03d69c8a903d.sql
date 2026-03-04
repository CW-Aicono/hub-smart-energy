
ALTER TABLE public.support_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill duration from existing sessions that have ended
UPDATE public.support_sessions
SET duration_minutes = GREATEST(1, EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::integer
WHERE duration_minutes IS NULL AND ended_at IS NOT NULL;
