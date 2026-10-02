ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_logout_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_logout_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_auto_logout_minutes_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_auto_logout_minutes_check
  CHECK (auto_logout_minutes IN (10, 20, 30, 60, 120));