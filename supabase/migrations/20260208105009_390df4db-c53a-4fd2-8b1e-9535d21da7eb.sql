-- Create a table for custom roles (beyond admin/user enum)
CREATE TABLE public.custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- Policies for custom_roles
CREATE POLICY "Users can view roles in their tenant"
  ON public.custom_roles FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can manage roles"
  ON public.custom_roles FOR ALL
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Create a table to assign permissions to custom roles
CREATE TABLE public.custom_role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(custom_role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for custom_role_permissions
CREATE POLICY "Users can view role permissions in their tenant"
  ON public.custom_role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_roles cr 
      WHERE cr.id = custom_role_id 
      AND cr.tenant_id = get_user_tenant_id()
    )
  );

CREATE POLICY "Admins can manage role permissions"
  ON public.custom_role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_roles cr 
      WHERE cr.id = custom_role_id 
      AND cr.tenant_id = get_user_tenant_id()
    ) 
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Create trigger for updated_at
CREATE TRIGGER update_custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();