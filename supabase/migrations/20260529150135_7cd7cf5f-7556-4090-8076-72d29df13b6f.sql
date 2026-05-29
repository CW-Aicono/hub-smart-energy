ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Bestehende Tenants mit mindestens einer Location als abgeschlossen markieren,
-- damit nicht plötzlich allen alten Tenants der Wizard erscheint.
UPDATE public.tenants t
SET onboarding_completed = true
WHERE EXISTS (SELECT 1 FROM public.locations l WHERE l.tenant_id = t.id);