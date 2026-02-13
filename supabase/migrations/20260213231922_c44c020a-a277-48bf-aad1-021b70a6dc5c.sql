
-- Add is_app_user flag to charging_user_groups
ALTER TABLE public.charging_user_groups ADD COLUMN IF NOT EXISTS is_app_user boolean NOT NULL DEFAULT false;

-- Add auth_user_id to charging_users (link app users to auth.users)
ALTER TABLE public.charging_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Add connector_type to charge_points
ALTER TABLE public.charge_points ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT 'Type2';

-- Create RLS policies for charging app users to read public charge points
CREATE POLICY "Authenticated users can view charge points"
  ON public.charge_points FOR SELECT
  TO authenticated
  USING (true);

-- App users can read their own charging sessions (by matching auth_user_id -> charging_users -> rfid_tag -> sessions.id_tag)
CREATE POLICY "App users can view their own sessions"
  ON public.charging_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.charging_users cu
      WHERE cu.auth_user_id = auth.uid()
        AND cu.rfid_tag = charging_sessions.id_tag
        AND cu.status = 'active'
    )
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- App users can view their own invoices
CREATE POLICY "App users can view their own invoices"
  ON public.charging_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.charging_sessions cs
      JOIN public.charging_users cu ON cu.rfid_tag = cs.id_tag
      WHERE cs.id = charging_invoices.session_id
        AND cu.auth_user_id = auth.uid()
        AND cu.status = 'active'
    )
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- App users can read charger_models
CREATE POLICY "Authenticated users can view charger models"
  ON public.charger_models FOR SELECT
  TO authenticated
  USING (true);
