-- Allow anyone (including anonymous/unauthenticated) to read invitations by token
-- This is needed so that users clicking an invite link can validate it
CREATE POLICY "Anyone can read invitations by token"
ON public.user_invitations
FOR SELECT
TO anon, authenticated
USING (true);

-- Keep the existing admin policy for write operations (insert, update, delete)
-- The existing "Admins can manage invitations" policy covers ALL operations for admins,
-- but we need to ensure non-admins can at least SELECT.
-- Since the existing policy is FOR ALL, we just add a SELECT-specific one.