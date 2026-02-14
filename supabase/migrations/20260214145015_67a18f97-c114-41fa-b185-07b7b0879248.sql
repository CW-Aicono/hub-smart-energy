
-- =============================================
-- Add missing permissions for all modules/features
-- =============================================

-- Charging / EV Infrastructure
INSERT INTO public.permissions (code, name, category) VALUES
  ('charging.view', 'Ladepunkte anzeigen', 'charging'),
  ('charging.create', 'Ladepunkte erstellen', 'charging'),
  ('charging.edit', 'Ladepunkte bearbeiten', 'charging'),
  ('charging.delete', 'Ladepunkte löschen', 'charging'),
  ('charging.billing_view', 'Ladeabrechnung anzeigen', 'charging'),
  ('charging.billing_manage', 'Ladeabrechnung verwalten', 'charging'),
  ('charging.tariffs_manage', 'Ladetarife verwalten', 'charging'),
  ('charging.users_manage', 'Ladenutzer verwalten', 'charging'),
  ('charging.app_manage', 'Lade-App verwalten', 'charging')
ON CONFLICT (code) DO NOTHING;

-- Network Infrastructure
INSERT INTO public.permissions (code, name, category) VALUES
  ('network.view', 'Netzwerkgeräte anzeigen', 'network'),
  ('network.edit', 'Netzwerkgeräte bearbeiten', 'network'),
  ('network.manage', 'Netzwerkinfrastruktur verwalten', 'network')
ON CONFLICT (code) DO NOTHING;

-- User Management
INSERT INTO public.permissions (code, name, category) VALUES
  ('users.view', 'Benutzer anzeigen', 'users'),
  ('users.invite', 'Benutzer einladen', 'users'),
  ('users.edit', 'Benutzer bearbeiten', 'users'),
  ('users.delete', 'Benutzer löschen', 'users'),
  ('users.block', 'Benutzer sperren', 'users')
ON CONFLICT (code) DO NOTHING;

-- Email Templates
INSERT INTO public.permissions (code, name, category) VALUES
  ('email_templates.view', 'E-Mail-Vorlagen anzeigen', 'email_templates'),
  ('email_templates.edit', 'E-Mail-Vorlagen bearbeiten', 'email_templates')
ON CONFLICT (code) DO NOTHING;

-- Energy Prices
INSERT INTO public.permissions (code, name, category) VALUES
  ('energy_prices.view', 'Energiepreise anzeigen', 'energy_prices'),
  ('energy_prices.edit', 'Energiepreise bearbeiten', 'energy_prices')
ON CONFLICT (code) DO NOTHING;

-- Live Values
INSERT INTO public.permissions (code, name, category) VALUES
  ('live_values.view', 'Live-Sensorwerte anzeigen', 'live_values')
ON CONFLICT (code) DO NOTHING;

-- Mobile App / Meter Reading App (extend existing meters category)
INSERT INTO public.permissions (code, name, category) VALUES
  ('meters.scanner_manage', 'Zähler-Scanner verwalten', 'meters')
ON CONFLICT (code) DO NOTHING;

-- Floor plan extended
INSERT INTO public.permissions (code, name, category) VALUES
  ('floors.rooms_manage', 'Räume verwalten', 'floors'),
  ('floors.sensors_manage', 'Sensoren auf Grundriss platzieren', 'floors')
ON CONFLICT (code) DO NOTHING;

-- Automation extended
INSERT INTO public.permissions (code, name, category) VALUES
  ('automation.manage', 'Automationen vollständig verwalten', 'automation')
ON CONFLICT (code) DO NOTHING;

-- Locations extended
INSERT INTO public.permissions (code, name, category) VALUES
  ('locations.archive', 'Standorte archivieren', 'locations')
ON CONFLICT (code) DO NOTHING;

-- Grant all new permissions to admin role
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, p.id
FROM public.permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = 'admin'::public.app_role AND rp.permission_id = p.id
);
