-- Add new columns to locations table
ALTER TABLE public.locations 
ADD COLUMN contact_person TEXT,
ADD COLUMN contact_email TEXT,
ADD COLUMN contact_phone TEXT,
ADD COLUMN energy_sources TEXT[] DEFAULT '{}',
ADD COLUMN show_on_map BOOLEAN NOT NULL DEFAULT true;