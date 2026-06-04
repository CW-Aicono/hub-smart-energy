
-- 1. Neue Tabelle für 1:N RFID-Tags pro Lade-Nutzer
CREATE TABLE IF NOT EXISTS public.charging_user_rfid_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.charging_users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS charging_user_rfid_tags_tenant_tag_uidx
  ON public.charging_user_rfid_tags (tenant_id, UPPER(tag));
CREATE INDEX IF NOT EXISTS charging_user_rfid_tags_user_idx
  ON public.charging_user_rfid_tags (user_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charging_user_rfid_tags TO authenticated;
GRANT ALL ON public.charging_user_rfid_tags TO service_role;

ALTER TABLE public.charging_user_rfid_tags ENABLE ROW LEVEL SECURITY;

-- Tenant-Isolation analog charging_users
CREATE POLICY "Tenant members manage own charging tags"
ON public.charging_user_rfid_tags FOR ALL
TO authenticated
USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Super admins manage all charging tags"
ON public.charging_user_rfid_tags FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_charging_user_rfid_tags_updated_at
BEFORE UPDATE ON public.charging_user_rfid_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill: bestehende rfid_tag-Werte aus charging_users übernehmen
INSERT INTO public.charging_user_rfid_tags (tenant_id, user_id, tag, label)
SELECT cu.tenant_id, cu.id, cu.rfid_tag, cu.rfid_label
FROM public.charging_users cu
WHERE cu.rfid_tag IS NOT NULL
  AND length(trim(cu.rfid_tag)) > 0
ON CONFLICT DO NOTHING;

-- 3. RLS auf charging_sessions anpassen: App-User darf seine Sessions auch via
-- neue Tag-Tabelle sehen (zusätzlich zur Legacy-Spalte und app_tag).
DROP POLICY IF EXISTS "App users can view their own sessions" ON public.charging_sessions;
CREATE POLICY "App users can view their own sessions"
ON public.charging_sessions FOR SELECT
TO authenticated
USING (
  (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.charging_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.status = 'active'
      AND (
        (cu.rfid_tag IS NOT NULL AND cu.rfid_tag = charging_sessions.id_tag)
        OR (cu.app_tag IS NOT NULL AND charging_sessions.id_tag LIKE 'APP%' AND cu.app_tag = charging_sessions.id_tag)
        OR EXISTS (
          SELECT 1 FROM public.charging_user_rfid_tags t
          WHERE t.user_id = cu.id
            AND UPPER(t.tag) = UPPER(charging_sessions.id_tag)
        )
      )
  )
);
