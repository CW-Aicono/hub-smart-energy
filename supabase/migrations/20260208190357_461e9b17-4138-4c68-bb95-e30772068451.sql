-- Add new permissions for floors, integrations, and dashboard
INSERT INTO public.permissions (code, name, description, category) VALUES
  -- Floors/Grundrisse
  ('floors.view', 'Grundrisse anzeigen', 'Kann Etagen und Grundrisse einsehen', 'floors'),
  ('floors.edit', 'Grundrisse bearbeiten', 'Kann Grundrisse bearbeiten und Sensoren positionieren', 'floors'),
  ('floors.create', 'Etagen anlegen', 'Kann neue Etagen erstellen', 'floors'),
  ('floors.delete', 'Etagen löschen', 'Kann Etagen löschen', 'floors'),
  -- Integrations
  ('integrations.view', 'Integrationen anzeigen', 'Kann Integrationen und Verbindungen einsehen', 'integrations'),
  ('integrations.edit', 'Integrationen bearbeiten', 'Kann Integrationseinstellungen ändern', 'integrations'),
  ('integrations.create', 'Integrationen anlegen', 'Kann neue Integrationen erstellen', 'integrations'),
  ('integrations.delete', 'Integrationen löschen', 'Kann Integrationen entfernen', 'integrations'),
  -- Dashboard
  ('dashboard.view', 'Dashboard anzeigen', 'Kann das Dashboard einsehen', 'dashboard'),
  ('dashboard.customize', 'Dashboard anpassen', 'Kann Dashboard-Widgets anpassen', 'dashboard'),
  -- Users additional
  ('users.activate', 'Benutzer aktivieren', 'Kann eingeladene Benutzer manuell aktivieren', 'users'),
  ('users.roles', 'Rollen verwalten', 'Kann Benutzerrollen zuweisen und ändern', 'users')
ON CONFLICT (code) DO NOTHING;