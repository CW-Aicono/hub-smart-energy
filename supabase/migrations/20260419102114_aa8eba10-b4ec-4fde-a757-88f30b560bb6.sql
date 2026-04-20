-- Table for project-level document attachments
CREATE TABLE public.sales_project_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.sales_projects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  file_size BIGINT,
  kategorie TEXT NOT NULL DEFAULT 'sonstiges',
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_project_attachments_project ON public.sales_project_attachments(project_id);
CREATE INDEX idx_sales_project_attachments_partner ON public.sales_project_attachments(partner_id);

ALTER TABLE public.sales_project_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner can view own project attachments"
ON public.sales_project_attachments FOR SELECT
USING (
  partner_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND p.partner_id = auth.uid())
);

CREATE POLICY "Partner can insert attachments to own projects"
ON public.sales_project_attachments FOR INSERT
WITH CHECK (
  partner_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.sales_projects p WHERE p.id = project_id AND p.partner_id = auth.uid())
);

CREATE POLICY "Partner can update own project attachments"
ON public.sales_project_attachments FOR UPDATE
USING (partner_id = auth.uid())
WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Partner can delete own project attachments"
ON public.sales_project_attachments FOR DELETE
USING (partner_id = auth.uid());

-- Storage RLS for sales-photos bucket: ${uid}/...
CREATE POLICY "sales-photos: users can view own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'sales-photos' AND auth.uid()::text = split_part(name, '/', 1));

CREATE POLICY "sales-photos: users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sales-photos' AND auth.uid()::text = split_part(name, '/', 1));

CREATE POLICY "sales-photos: users can update own files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'sales-photos' AND auth.uid()::text = split_part(name, '/', 1));

CREATE POLICY "sales-photos: users can delete own files"
ON storage.objects FOR DELETE
USING (bucket_id = 'sales-photos' AND auth.uid()::text = split_part(name, '/', 1));