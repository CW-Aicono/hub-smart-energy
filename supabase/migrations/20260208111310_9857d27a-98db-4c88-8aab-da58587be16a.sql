-- Create floors table for building floor plans
CREATE TABLE public.floors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor_number INTEGER NOT NULL DEFAULT 0,
  floor_plan_url TEXT,
  description TEXT,
  area_sqm NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - floors inherit access from their parent location
CREATE POLICY "Users can view floors of their tenant locations"
ON public.floors
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = floors.location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
);

CREATE POLICY "Admins can insert floors"
ON public.floors
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = floors.location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
);

CREATE POLICY "Admins can update floors"
ON public.floors
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = floors.location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
);

CREATE POLICY "Admins can delete floors"
ON public.floors
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = floors.location_id
    AND l.tenant_id = public.get_user_tenant_id()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_floors_updated_at
BEFORE UPDATE ON public.floors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_floors_location_id ON public.floors(location_id);

-- Create storage bucket for floor plans
INSERT INTO storage.buckets (id, name, public)
VALUES ('floor-plans', 'floor-plans', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for floor plans
CREATE POLICY "Floor plans are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'floor-plans');

CREATE POLICY "Admins can upload floor plans"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'floor-plans'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update floor plans"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'floor-plans'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete floor plans"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'floor-plans'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);