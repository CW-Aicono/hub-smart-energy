-- Create enum for usage types
CREATE TYPE public.location_usage_type AS ENUM (
  'verwaltungsgebaeude',
  'universitaet',
  'schule',
  'kindertageseinrichtung',
  'sportstaette',
  'jugendzentrum',
  'sonstiges'
);

-- Add usage_type column to locations
ALTER TABLE public.locations 
ADD COLUMN usage_type public.location_usage_type DEFAULT 'sonstiges';