-- Create a table for granular permissions
CREATE TABLE public.permissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create a table for role-permission assignments
CREATE TABLE public.role_permissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    role app_role NOT NULL,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(role, permission_id)
);

-- Enable RLS on both tables
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for permissions table (read-only for authenticated users)
CREATE POLICY "Authenticated users can view permissions"
ON public.permissions
FOR SELECT
TO authenticated
USING (true);

-- Only admins can modify permissions
CREATE POLICY "Admins can manage permissions"
ON public.permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policies for role_permissions table
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default permissions
INSERT INTO public.permissions (code, name, description, category) VALUES
-- Location permissions
('locations.view', 'Standorte anzeigen', 'Kann alle Standorte des Mandanten einsehen', 'locations'),
('locations.create', 'Standorte erstellen', 'Kann neue Standorte anlegen', 'locations'),
('locations.edit', 'Standorte bearbeiten', 'Kann bestehende Standorte bearbeiten', 'locations'),
('locations.delete', 'Standorte löschen', 'Kann Standorte löschen', 'locations'),

-- Energy data permissions
('energy.view', 'Energiedaten anzeigen', 'Kann Energieverbrauchsdaten einsehen', 'energy'),
('energy.create', 'Energiedaten erfassen', 'Kann neue Energiedaten eingeben', 'energy'),
('energy.edit', 'Energiedaten bearbeiten', 'Kann Energiedaten korrigieren', 'energy'),
('energy.delete', 'Energiedaten löschen', 'Kann Energiedaten löschen', 'energy'),
('energy.export', 'Energiedaten exportieren', 'Kann Energiedaten exportieren', 'energy'),

-- Report permissions
('reports.view', 'Berichte anzeigen', 'Kann Berichte einsehen', 'reports'),
('reports.create', 'Berichte erstellen', 'Kann neue Berichte erstellen', 'reports'),
('reports.export', 'Berichte exportieren', 'Kann Berichte als PDF/Excel exportieren', 'reports'),

-- User management permissions
('users.view', 'Benutzer anzeigen', 'Kann Benutzerliste einsehen', 'users'),
('users.invite', 'Benutzer einladen', 'Kann neue Benutzer einladen', 'users'),
('users.edit', 'Benutzer bearbeiten', 'Kann Benutzerprofile bearbeiten', 'users'),
('users.delete', 'Benutzer löschen', 'Kann Benutzer entfernen', 'users'),
('users.block', 'Benutzer sperren', 'Kann Benutzer sperren/entsperren', 'users'),

-- Settings permissions
('settings.view', 'Einstellungen anzeigen', 'Kann Mandanteneinstellungen einsehen', 'settings'),
('settings.edit', 'Einstellungen bearbeiten', 'Kann Mandanteneinstellungen ändern', 'settings'),
('settings.branding', 'Branding anpassen', 'Kann Logo und Farben anpassen', 'settings');

-- Assign all permissions to admin role
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::app_role, id FROM public.permissions;

-- Assign basic permissions to user role
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'user'::app_role, id FROM public.permissions 
WHERE code IN (
    'locations.view',
    'energy.view',
    'reports.view'
);

-- Create a function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role = ur.role
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = _user_id
          AND p.code = _permission_code
    )
$$;