
CREATE TABLE public.custom_widget_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'BarChart3',
  color TEXT DEFAULT '#3b82f6',
  chart_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_shared BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_widget_definitions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything within their tenant
CREATE POLICY "Admins can manage custom widgets"
ON public.custom_widget_definitions
FOR ALL
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  AND public.has_role(auth.uid(), 'admin')
);

-- All tenant users can view shared widgets
CREATE POLICY "Tenant users can view shared widgets"
ON public.custom_widget_definitions
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND is_shared = true
);
