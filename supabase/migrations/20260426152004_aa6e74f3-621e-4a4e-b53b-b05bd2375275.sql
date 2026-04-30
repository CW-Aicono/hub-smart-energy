ALTER TABLE public.simulator_instances
  ADD COLUMN IF NOT EXISTS power_kw numeric NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS id_tag text;