-- Update language constraint to include Spanish and Dutch
ALTER TABLE public.user_preferences 
DROP CONSTRAINT IF EXISTS user_preferences_language_check;

ALTER TABLE public.user_preferences 
ADD CONSTRAINT user_preferences_language_check 
CHECK (language IN ('de', 'en', 'es', 'nl'));