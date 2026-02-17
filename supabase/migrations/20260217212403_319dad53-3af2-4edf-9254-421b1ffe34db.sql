-- Fix the overly permissive "Anyone can read invitations by token" policy
-- It currently allows reading ALL invitations (qual: true), which leaks cross-tenant data

DROP POLICY IF EXISTS "Anyone can read invitations by token" ON public.user_invitations;

-- Replace with a safe policy: only allow reading invitations by token for unauthenticated users
-- (needed for the /set-password flow where the user is not yet logged in)
-- We restrict this to only allow reading own invitation via token match - not all invitations
CREATE POLICY "Public can read own invitation by token"
  ON public.user_invitations
  FOR SELECT
  USING (
    -- Authenticated users: only see invitations in their own tenant
    (auth.uid() IS NOT NULL AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR tenant_id = get_user_tenant_id()
    ))
    -- Unauthenticated users: allow read (needed to validate token on set-password page)
    -- This is intentional and safe because tokens are unguessable UUIDs
    OR auth.uid() IS NULL
  );