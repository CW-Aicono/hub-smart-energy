
-- Insert Super-Admin specific permissions
INSERT INTO public.permissions (code, name, description, category) VALUES
  ('sa_dashboard_view', 'Dashboard anzeigen', 'Zugriff auf das Super-Admin Dashboard', 'super-admin'),
  ('sa_tenants_view', 'Mandanten anzeigen', 'Mandantenübersicht einsehen', 'super-admin'),
  ('sa_tenants_manage', 'Mandanten verwalten', 'Mandanten anlegen, bearbeiten und sperren', 'super-admin'),
  ('sa_users_view', 'SA-Nutzer anzeigen', 'Super-Admin Nutzer einsehen', 'super-admin'),
  ('sa_users_manage', 'SA-Nutzer verwalten', 'Super-Admin Nutzer anlegen, bearbeiten und entfernen', 'super-admin'),
  ('sa_roles_view', 'Rollen anzeigen', 'Super-Admin Rollen und Rechte einsehen', 'super-admin'),
  ('sa_roles_manage', 'Rollen verwalten', 'Super-Admin Rollen erstellen, bearbeiten und löschen', 'super-admin'),
  ('sa_billing_view', 'Abrechnung anzeigen', 'Rechnungen und Abrechnungsdaten einsehen', 'super-admin'),
  ('sa_billing_manage', 'Abrechnung verwalten', 'Rechnungen erstellen und verwalten', 'super-admin'),
  ('sa_statistics_view', 'Statistiken anzeigen', 'Plattformweite Statistiken einsehen', 'super-admin'),
  ('sa_support_access', 'Support-Zugriff', 'Remote-Support-Sitzungen starten und verwalten', 'super-admin'),
  ('sa_licenses_manage', 'Lizenzen verwalten', 'Lizenzpläne zuweisen und ändern', 'super-admin'),
  ('sa_modules_manage', 'Module verwalten', 'Feature-Module für Mandanten aktivieren/deaktivieren', 'super-admin'),
  ('sa_map_view', 'Karte anzeigen', 'Standortkarte aller Mandanten einsehen', 'super-admin')
ON CONFLICT (code) DO NOTHING;
