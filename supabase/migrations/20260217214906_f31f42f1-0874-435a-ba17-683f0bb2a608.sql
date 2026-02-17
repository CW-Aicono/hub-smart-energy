
-- =============================================================================
-- SECURITY FIX #1: user_invitations
-- Problem: Anonyme (nicht eingeloggte) Nutzer können alle Einladungs-Token
--          und E-Mail-Adressen lesen (auth.uid() IS NULL = true für alle).
-- Fix: Token-Zugriff nur noch für den konkreten Token-Inhaber (via token-Parameter),
--      und nur für authentifizierte Admins/Super-Admins.
--      Der Aktivierungsflow in der Edge-Function (activate-invited-user) läuft
--      mit service_role und benötigt keine RLS-Freigabe.
-- =============================================================================

DROP POLICY IF EXISTS "Public can read own invitation by token" ON public.user_invitations;

-- Nur authentifizierte Admins und Super-Admins dürfen Einladungen lesen.
-- Die Edge-Function nutzt den Service-Role-Key und umgeht RLS ohnehin.
CREATE POLICY "Authenticated admins can view invitations in their tenant"
  ON public.user_invitations
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id())
  );


-- =============================================================================
-- SECURITY FIX #3: brighthub_settings
-- Problem: Alle Tenant-Nutzer können API-Key und Webhook-Secret lesen.
-- Fix: SELECT auf Admins beschränken.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their tenant brighthub settings" ON public.brighthub_settings;

CREATE POLICY "Admins can view their tenant brighthub settings"
  ON public.brighthub_settings
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = get_user_tenant_id())
    AND has_role(auth.uid(), 'admin'::app_role)
  );


-- =============================================================================
-- SECURITY FIX #5: charging_users
-- Problem: Alle Tenant-Nutzer können sensible Daten (E-Mail, Telefon, RFID-Tag,
--          app_tag) aller Lade-Kunden sehen.
-- Fix:
--   a) Reguläre Tenant-Nutzer sehen nur nicht-sensitive Spalten über eine View.
--   b) Die direkte SELECT-Policy wird auf Admins + eigene App-Nutzer beschränkt.
-- =============================================================================

-- Bestehende breite SELECT-Policy entfernen
DROP POLICY IF EXISTS "Tenant users can view their charging users" ON public.charging_users;

-- Admins sehen alles (bereits durch "Admins can manage charging users" ALL-Policy abgedeckt,
-- aber wir machen SELECT explizit, damit es klar ist)
CREATE POLICY "Admins can select charging users"
  ON public.charging_users
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = get_user_tenant_id())
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- App-Nutzer können nur ihr eigenes Profil sehen
CREATE POLICY "App users can view own charging user profile"
  ON public.charging_users
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    AND status = 'active'
  );

-- View für nicht-sensitive Listenansicht (z.B. für Gruppenanzeige in der App)
-- Schreibt keine sensiblen Felder heraus
CREATE OR REPLACE VIEW public.charging_users_public
WITH (security_invoker = on) AS
  SELECT
    id,
    tenant_id,
    group_id,
    name,
    status,
    created_at,
    updated_at
  FROM public.charging_users;
