
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, template_key)
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email templates of their tenant"
ON public.email_templates FOR SELECT
USING (tenant_id IN (SELECT p.tenant_id::uuid FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Admins can insert email templates"
ON public.email_templates FOR INSERT
WITH CHECK (tenant_id IN (SELECT p.tenant_id::uuid FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Admins can update email templates"
ON public.email_templates FOR UPDATE
USING (tenant_id IN (SELECT p.tenant_id::uuid FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Admins can delete email templates"
ON public.email_templates FOR DELETE
USING (tenant_id IN (SELECT p.tenant_id::uuid FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
