-- Create integrations table for available integration types (e.g., Loxone Miniserver)
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'loxone_miniserver'
  description TEXT,
  icon TEXT, -- icon name for UI
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create location_integrations table to link integrations to locations
CREATE TABLE public.location_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}'::jsonb, -- location-specific config (host, port, credentials, etc.)
  is_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending', -- pending, syncing, success, error
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(location_id, integration_id)
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies for integrations
CREATE POLICY "Users can view integrations from their tenant"
ON public.integrations
FOR SELECT
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can create integrations"
ON public.integrations
FOR INSERT
WITH CHECK (
  tenant_id = public.get_user_tenant_id() 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update integrations"
ON public.integrations
FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id() 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete integrations"
ON public.integrations
FOR DELETE
USING (
  tenant_id = public.get_user_tenant_id() 
  AND public.has_role(auth.uid(), 'admin')
);

-- RLS policies for location_integrations
CREATE POLICY "Users can view location integrations from their tenant"
ON public.location_integrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
);

CREATE POLICY "Admins can create location integrations"
ON public.location_integrations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update location integrations"
ON public.location_integrations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete location integrations"
ON public.location_integrations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
  AND public.has_role(auth.uid(), 'admin')
);

-- Create triggers for updated_at
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_location_integrations_updated_at
BEFORE UPDATE ON public.location_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_integrations_tenant_id ON public.integrations(tenant_id);
CREATE INDEX idx_integrations_type ON public.integrations(type);
CREATE INDEX idx_location_integrations_location_id ON public.location_integrations(location_id);
CREATE INDEX idx_location_integrations_integration_id ON public.location_integrations(integration_id);