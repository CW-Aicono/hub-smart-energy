-- Add category column to integrations table
ALTER TABLE public.integrations 
ADD COLUMN category TEXT NOT NULL DEFAULT 'sonstige';

-- Create integration_categories table for available categories
CREATE TABLE public.integration_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- Enable RLS
ALTER TABLE public.integration_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for integration_categories
CREATE POLICY "Users can view categories from their tenant"
ON public.integration_categories
FOR SELECT
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can manage categories"
ON public.integration_categories
FOR ALL
USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- Add index
CREATE INDEX idx_integration_categories_tenant_id ON public.integration_categories(tenant_id);