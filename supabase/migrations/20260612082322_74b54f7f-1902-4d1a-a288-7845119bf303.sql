ALTER TABLE public.charging_user_groups
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.charging_user_groups
  DROP CONSTRAINT IF EXISTS charging_user_groups_status_check;

ALTER TABLE public.charging_user_groups
  ADD CONSTRAINT charging_user_groups_status_check
  CHECK (status IN ('active', 'blocked', 'archived'));