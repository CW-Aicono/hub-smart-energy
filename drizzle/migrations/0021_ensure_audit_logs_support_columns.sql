ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_label text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS support_session_id uuid REFERENCES public.support_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_support_session ON public.audit_logs(support_session_id) WHERE support_session_id IS NOT NULL;