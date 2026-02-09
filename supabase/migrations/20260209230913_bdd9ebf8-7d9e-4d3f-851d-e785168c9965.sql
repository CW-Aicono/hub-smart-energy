
-- Neue Berechtigungen für Messstellen (meters)
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('meters.view', 'Messstellen anzeigen', 'Kann alle Messstellen einsehen', 'meters'),
  ('meters.create', 'Messstellen anlegen', 'Kann neue Messstellen erstellen', 'meters'),
  ('meters.edit', 'Messstellen bearbeiten', 'Kann bestehende Messstellen bearbeiten', 'meters'),
  ('meters.delete', 'Messstellen löschen', 'Kann Messstellen löschen', 'meters'),
  ('meters.archive', 'Messstellen archivieren', 'Kann Messstellen archivieren und wiederherstellen', 'meters'),
  ('meters.readings', 'Ablesungen verwalten', 'Kann Zählerablesungen erfassen und bearbeiten', 'meters')
ON CONFLICT (code) DO NOTHING;

-- Neue Berechtigungen für Alarmregeln
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('alerts.view', 'Alarmregeln anzeigen', 'Kann Alarmregeln und Benachrichtigungen einsehen', 'alerts'),
  ('alerts.create', 'Alarmregeln erstellen', 'Kann neue Alarmregeln anlegen', 'alerts'),
  ('alerts.edit', 'Alarmregeln bearbeiten', 'Kann bestehende Alarmregeln ändern', 'alerts'),
  ('alerts.delete', 'Alarmregeln löschen', 'Kann Alarmregeln entfernen', 'alerts')
ON CONFLICT (code) DO NOTHING;

-- Neue Berechtigungen für Scanner
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('scanners.view', 'Scanner anzeigen', 'Kann konfigurierte Scanner einsehen', 'scanners'),
  ('scanners.manage', 'Scanner verwalten', 'Kann Scanner erstellen, bearbeiten und löschen', 'scanners')
ON CONFLICT (code) DO NOTHING;

-- Neue Berechtigungen für Rollenverwaltung
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('roles.view', 'Rollen anzeigen', 'Kann benutzerdefinierte Rollen einsehen', 'roles'),
  ('roles.manage', 'Rollen verwalten', 'Kann Rollen erstellen, bearbeiten und Berechtigungen zuweisen', 'roles')
ON CONFLICT (code) DO NOTHING;

-- Alle neuen Berechtigungen der Admin-Rolle zuweisen
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', p.id FROM public.permissions p
WHERE p.code IN (
  'meters.view', 'meters.create', 'meters.edit', 'meters.delete', 'meters.archive', 'meters.readings',
  'alerts.view', 'alerts.create', 'alerts.edit', 'alerts.delete',
  'scanners.view', 'scanners.manage',
  'roles.view', 'roles.manage'
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role = 'admin' AND rp.permission_id = p.id
);

-- Basis-Leserechte der User-Rolle zuweisen
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'user', p.id FROM public.permissions p
WHERE p.code IN ('meters.view', 'alerts.view', 'scanners.view', 'roles.view')
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role = 'user' AND rp.permission_id = p.id
);
