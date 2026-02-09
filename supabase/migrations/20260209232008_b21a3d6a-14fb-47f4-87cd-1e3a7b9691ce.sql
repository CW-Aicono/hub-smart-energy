
-- Remote-Support-Feld für Mandanten
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS remote_support_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS remote_support_enabled_at timestamptz;
