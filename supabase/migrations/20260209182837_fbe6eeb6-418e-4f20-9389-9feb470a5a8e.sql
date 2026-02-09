
-- Step 1: Just extend the enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
