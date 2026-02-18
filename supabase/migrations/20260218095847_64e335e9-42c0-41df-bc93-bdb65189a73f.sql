-- Table to store invite action links, referenced by a UUID sent in email
-- This prevents email scanners from consuming Supabase one-time tokens
CREATE TABLE public.invite_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_link TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS - table only accessed via edge function with service key
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;
-- No public policies needed - all access goes through edge functions with service role