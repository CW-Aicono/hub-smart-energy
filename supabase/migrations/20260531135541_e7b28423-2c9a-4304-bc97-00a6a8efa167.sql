-- Impersonation-basierter Remote-Support: technische Support-User je Tenant.

-- 1) Mapping-Tabelle: 1 technischer Support-User pro Tenant
CREATE TABLE IF NOT EXISTS public.tenant_support_users (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE,
  support_email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_support_users TO authenticated;
GRANT ALL ON public.tenant_support_users TO service_role;

ALTER TABLE public.tenant_support_users ENABLE ROW LEVEL SECURITY;

-- Nur Super-Admins können das Mapping einsehen
DROP POLICY IF EXISTS "super_admin_select_tenant_support_users" ON public.tenant_support_users;
CREATE POLICY "super_admin_select_tenant_support_users"
ON public.tenant_support_users FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 2) support_sessions: optionale Spalte für den verwendeten Impersonation-User
ALTER TABLE public.support_sessions
  ADD COLUMN IF NOT EXISTS impersonated_user_id uuid;

-- 3) Helper-Funktion: prüft, ob ein User ein technischer Support-User ist.
--    Wird gebraucht, damit Audit-Logs (z.B. last_modified_by) den Original-Super-Admin
--    sichtbar machen können (über aktive support_sessions).
CREATE OR REPLACE FUNCTION public.is_support_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_support_users WHERE auth_user_id = _user_id)
$$;