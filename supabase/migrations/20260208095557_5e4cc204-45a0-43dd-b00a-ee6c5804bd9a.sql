-- Add is_main_location column to locations table
ALTER TABLE public.locations ADD COLUMN is_main_location boolean NOT NULL DEFAULT false;

-- Create a function to ensure only one main location per tenant
CREATE OR REPLACE FUNCTION public.ensure_single_main_location()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this location as main, unset all other main locations in the same tenant
  IF NEW.is_main_location = true THEN
    UPDATE public.locations 
    SET is_main_location = false 
    WHERE tenant_id = NEW.tenant_id 
      AND id != NEW.id 
      AND is_main_location = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to enforce single main location
CREATE TRIGGER ensure_single_main_location_trigger
BEFORE INSERT OR UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_main_location();

-- Create index for quick main location lookup
CREATE INDEX idx_locations_main_location ON public.locations(tenant_id, is_main_location) WHERE is_main_location = true;