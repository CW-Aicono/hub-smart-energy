
-- Storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Tenant users can view task attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'task-attachments'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Tenant users can upload task attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'task-attachments'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Tenant users can delete task attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'task-attachments'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Table to track task attachments
CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view task attachments"
ON public.task_attachments FOR SELECT
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can insert task attachments"
ON public.task_attachments FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can delete task attachments"
ON public.task_attachments FOR DELETE
USING (tenant_id = public.get_user_tenant_id());

CREATE INDEX idx_task_attachments_task_id ON public.task_attachments(task_id);
