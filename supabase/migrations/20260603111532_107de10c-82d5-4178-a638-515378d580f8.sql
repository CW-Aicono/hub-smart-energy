ALTER TABLE public.charge_points
  ADD COLUMN auto_reboot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_reboot_time time NOT NULL DEFAULT '04:00',
  ADD COLUMN auto_reboot_type text NOT NULL DEFAULT 'Soft' CHECK (auto_reboot_type IN ('Soft','Hard')),
  ADD COLUMN auto_reboot_skip_if_charging boolean NOT NULL DEFAULT true,
  ADD COLUMN auto_reboot_last_run_at timestamptz;