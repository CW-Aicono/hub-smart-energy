ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tasks_ignored_at ON public.tasks (tenant_id) WHERE ignored_at IS NOT NULL;