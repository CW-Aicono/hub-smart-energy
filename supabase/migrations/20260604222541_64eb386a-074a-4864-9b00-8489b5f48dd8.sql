ALTER TABLE public.partners
ADD COLUMN IF NOT EXISTS ai_analysis_mode text NOT NULL DEFAULT 'standard';

ALTER TABLE public.partners
DROP CONSTRAINT IF EXISTS partners_ai_analysis_mode_check;

ALTER TABLE public.partners
ADD CONSTRAINT partners_ai_analysis_mode_check
CHECK (ai_analysis_mode IN ('standard', 'high_performance'));