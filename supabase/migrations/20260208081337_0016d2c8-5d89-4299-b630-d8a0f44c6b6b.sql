-- Create enum for location types
CREATE TYPE public.location_type AS ENUM ('standort', 'gebaeude', 'bereich');

-- Create enum for energy types
CREATE TYPE public.energy_type AS ENUM ('strom', 'gas', 'waerme', 'wasser');

-- Create tenants table
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  branding JSONB NOT NULL DEFAULT '{
    "primary_color": "#1a365d",
    "secondary_color": "#2d8a6e",
    "accent_color": "#f59e0b",
    "font_family": "Inter"
  }'::jsonb,
  logo_url TEXT,
  report_settings JSONB DEFAULT '{
    "footer_text": "",
    "show_logo": true
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create locations table with hierarchy
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type location_type NOT NULL DEFAULT 'standort',
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Deutschland',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create energy_readings table
CREATE TABLE public.energy_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  energy_type energy_type NOT NULL,
  value DECIMAL(15, 4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kWh',
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add tenant_id to profiles table
ALTER TABLE public.profiles ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_locations_tenant_id ON public.locations(tenant_id);
CREATE INDEX idx_locations_parent_id ON public.locations(parent_id);
CREATE INDEX idx_locations_type ON public.locations(type);
CREATE INDEX idx_energy_readings_location_id ON public.energy_readings(location_id);
CREATE INDEX idx_energy_readings_recorded_at ON public.energy_readings(recorded_at);
CREATE INDEX idx_energy_readings_energy_type ON public.energy_readings(energy_type);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_readings ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Tenants RLS policies
CREATE POLICY "Users can view their own tenant"
ON public.tenants FOR SELECT
USING (id = get_user_tenant_id());

CREATE POLICY "Admins can update their tenant"
ON public.tenants FOR UPDATE
USING (id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- Locations RLS policies
CREATE POLICY "Users can view locations in their tenant"
ON public.locations FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert locations"
ON public.locations FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update locations"
ON public.locations FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete locations"
ON public.locations FOR DELETE
USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- Energy readings RLS policies
CREATE POLICY "Users can view energy readings in their tenant"
ON public.energy_readings FOR SELECT
USING (
  location_id IN (
    SELECT id FROM public.locations WHERE tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Admins can insert energy readings"
ON public.energy_readings FOR INSERT
WITH CHECK (
  location_id IN (
    SELECT id FROM public.locations WHERE tenant_id = get_user_tenant_id()
  ) AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update energy readings"
ON public.energy_readings FOR UPDATE
USING (
  location_id IN (
    SELECT id FROM public.locations WHERE tenant_id = get_user_tenant_id()
  ) AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete energy readings"
ON public.energy_readings FOR DELETE
USING (
  location_id IN (
    SELECT id FROM public.locations WHERE tenant_id = get_user_tenant_id()
  ) AND has_role(auth.uid(), 'admin')
);

-- Update triggers for updated_at
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for tenant assets
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-assets', 'tenant-assets', true);

-- Storage policies for tenant assets
CREATE POLICY "Anyone can view tenant assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-assets');

CREATE POLICY "Admins can upload tenant assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tenant-assets' 
  AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update tenant assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'tenant-assets' 
  AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete tenant assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'tenant-assets' 
  AND has_role(auth.uid(), 'admin')
);