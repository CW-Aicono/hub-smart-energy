
CREATE TABLE public.loxone_snippet_manuals (
  template_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  purpose_md TEXT NOT NULL DEFAULT '',
  wiring_md TEXT NOT NULL DEFAULT '',
  test_md TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.loxone_snippet_manuals TO authenticated;
GRANT ALL ON public.loxone_snippet_manuals TO service_role;

ALTER TABLE public.loxone_snippet_manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manuals_read_all_auth"
ON public.loxone_snippet_manuals
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "manuals_write_super_admin"
ON public.loxone_snippet_manuals
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
