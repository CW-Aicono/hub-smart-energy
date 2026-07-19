
CREATE TABLE public.loxone_snippet_manual_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL REFERENCES public.loxone_snippet_manuals(template_key) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('purpose','wiring','test')),
  storage_path text NOT NULL,
  caption text,
  width text NOT NULL DEFAULT 'full' CHECK (width IN ('small','medium','full')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX ON public.loxone_snippet_manual_images (template_key, section, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loxone_snippet_manual_images TO authenticated;
GRANT ALL ON public.loxone_snippet_manual_images TO service_role;

ALTER TABLE public.loxone_snippet_manual_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual images readable by authenticated"
  ON public.loxone_snippet_manual_images FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "manual images writable by super admin"
  ON public.loxone_snippet_manual_images FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_loxone_snippet_manual_images_updated
  BEFORE UPDATE ON public.loxone_snippet_manual_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the loxone-manuals bucket (bucket wird per Tool angelegt)
CREATE POLICY "loxone-manuals read for authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'loxone-manuals');

CREATE POLICY "loxone-manuals write for super admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'loxone-manuals' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "loxone-manuals update for super admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'loxone-manuals' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "loxone-manuals delete for super admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'loxone-manuals' AND public.has_role(auth.uid(), 'super_admin'));
