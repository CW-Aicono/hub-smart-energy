-- Converge the setup column defaults without reopening any existing tenant.
ALTER TABLE public.tenants ALTER COLUMN setup_status SET DEFAULT 'setup';
ALTER TABLE public.tenants ALTER COLUMN setup_status SET NOT NULL;
ALTER TABLE public.support_sessions ALTER COLUMN session_kind SET DEFAULT 'support';
ALTER TABLE public.support_sessions ALTER COLUMN session_kind SET NOT NULL;
ALTER TABLE public.tenants VALIDATE CONSTRAINT tenants_setup_status_check;
ALTER TABLE public.support_sessions VALIDATE CONSTRAINT support_sessions_kind_check;
COMMENT ON COLUMN public.tenants.setup_status IS 'New tenants start in setup; handed-over tenants must never be reopened during deployment.';
COMMENT ON COLUMN public.support_sessions.session_kind IS 'Explicit setup/support classification required; never fall back to unclassified remote access.';