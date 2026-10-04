CREATE TABLE IF NOT EXISTS public.partner_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (partner_id, module_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_modules TO authenticated;
GRANT ALL ON public.partner_modules TO service_role;
ALTER TABLE public.partner_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_modules_super_admin_all" ON public.partner_modules TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "partner_modules_member_select" ON public.partner_modules FOR SELECT TO authenticated
  USING (public.is_partner_member(auth.uid(), partner_id));

INSERT INTO public.partner_modules (partner_id, module_code)
SELECT DISTINCT t.partner_id, tm.module_code
FROM public.tenant_modules tm JOIN public.tenants t ON t.id = tm.tenant_id
WHERE t.partner_id IS NOT NULL AND tm.is_enabled = true
ON CONFLICT DO NOTHING;