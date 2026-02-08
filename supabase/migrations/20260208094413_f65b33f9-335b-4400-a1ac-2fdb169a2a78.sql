-- Drop the old enum and create a new one with the correct values
-- First, update the column to text temporarily
ALTER TABLE public.locations ALTER COLUMN type DROP DEFAULT;
ALTER TABLE public.locations ALTER COLUMN type TYPE text USING type::text;

-- Drop the old enum
DROP TYPE IF EXISTS public.location_type;

-- Create the new enum with the correct values
CREATE TYPE public.location_type AS ENUM ('einzelgebaeude', 'gebaeudekomplex', 'sonstiges');

-- Convert existing data to new values
UPDATE public.locations SET type = 'sonstiges' WHERE type NOT IN ('einzelgebaeude', 'gebaeudekomplex', 'sonstiges');

-- Convert the column back to the enum
ALTER TABLE public.locations ALTER COLUMN type TYPE public.location_type USING type::public.location_type;
ALTER TABLE public.locations ALTER COLUMN type SET DEFAULT 'einzelgebaeude'::public.location_type;