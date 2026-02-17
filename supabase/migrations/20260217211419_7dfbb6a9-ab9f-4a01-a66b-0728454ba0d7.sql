
-- =============================================================
-- VOLLSTÄNDIGE MANDANTENTRENNUNG - Alle RLS-Lücken schließen
-- =============================================================

-- 1. charge_points: Entferne "USING (true)" Policy → jeder konnte alle Ladepunkte sehen
DROP POLICY IF EXISTS "Authenticated users can view charge points" ON public.charge_points;
-- Die korrekte Policy "Users can view charge points in their tenant" bleibt erhalten.

-- 2. ocpp_message_log: Logs müssen mandantengetrennt sein
DROP POLICY IF EXISTS "Authenticated users can read OCPP logs" ON public.ocpp_message_log;

CREATE POLICY "Users can view OCPP logs for their tenant charge points"
  ON public.ocpp_message_log
  FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.charge_points cp
      WHERE cp.ocpp_id = ocpp_message_log.charge_point_id
        AND cp.tenant_id = get_user_tenant_id()
    )
  );

CREATE POLICY "System can insert OCPP logs"
  ON public.ocpp_message_log
  FOR INSERT
  WITH CHECK (true);

-- 3. user_invitations: Mandanten-Admin darf nur eigene Einladungen verwalten
-- Problem: keine tenant_id auf der Tabelle → wir fügen eine hinzu
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Bestehende Einladungen: tenant_id via invited_by befüllen
UPDATE public.user_invitations ui
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE p.user_id = ui.invited_by
  AND ui.tenant_id IS NULL;

-- Policy aktualisieren
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.user_invitations;

CREATE POLICY "Admins can manage invitations in their tenant"
  ON public.user_invitations
  FOR ALL
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND tenant_id = get_user_tenant_id()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND tenant_id = get_user_tenant_id()
    )
  );

-- Anyone can still read invitation by token (needed for signup flow)
-- "Anyone can read invitations by token" bleibt erhalten

-- 4. user_roles INSERT: Admin darf nur Rollen für User seines Mandanten anlegen
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles in their tenant"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
          AND p.tenant_id = get_user_tenant_id()
      )
    )
  );

-- 5. permissions: Nur Super-Admin darf permissions verwalten (nicht tenant-admins)
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.permissions;

CREATE POLICY "Super admins can manage permissions"
  ON public.permissions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 6. role_permissions: Nur Super-Admin darf systemweite role_permissions verwalten
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;

CREATE POLICY "Super admins can manage role permissions"
  ON public.role_permissions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
