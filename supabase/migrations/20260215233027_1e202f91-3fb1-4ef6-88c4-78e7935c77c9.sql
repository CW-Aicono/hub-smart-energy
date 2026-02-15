-- Add week_start_day column to tenants table (0=Sunday, 1=Monday, ..., 6=Saturday)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS week_start_day smallint NOT NULL DEFAULT 1;

-- Add check constraint
ALTER TABLE public.tenants ADD CONSTRAINT tenants_week_start_day_check CHECK (week_start_day >= 0 AND week_start_day <= 6);