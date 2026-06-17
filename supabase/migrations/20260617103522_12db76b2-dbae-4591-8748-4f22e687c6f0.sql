DO $$
DECLARE
  r RECORD;
  keep_id uuid;
BEGIN
  FOR r IN
    SELECT tenant_id, auth_user_id
    FROM public.charging_users
    WHERE auth_user_id IS NOT NULL
    GROUP BY tenant_id, auth_user_id
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keep_id
      FROM public.charging_users
     WHERE tenant_id = r.tenant_id AND auth_user_id = r.auth_user_id
     ORDER BY created_at ASC
     LIMIT 1;

    UPDATE public.charging_invoices
       SET user_id = keep_id
     WHERE user_id IN (SELECT id FROM public.charging_users
                        WHERE tenant_id = r.tenant_id AND auth_user_id = r.auth_user_id AND id <> keep_id);

    UPDATE public.charging_user_rfid_tags
       SET user_id = keep_id
     WHERE user_id IN (SELECT id FROM public.charging_users
                        WHERE tenant_id = r.tenant_id AND auth_user_id = r.auth_user_id AND id <> keep_id);

    UPDATE public.charging_billing_group_members
       SET user_id = keep_id
     WHERE user_id IN (SELECT id FROM public.charging_users
                        WHERE tenant_id = r.tenant_id AND auth_user_id = r.auth_user_id AND id <> keep_id);

    DELETE FROM public.charging_users
     WHERE tenant_id = r.tenant_id
       AND auth_user_id = r.auth_user_id
       AND id <> keep_id;
  END LOOP;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_charging_users_tenant_auth_user_unique
  ON public.charging_users (tenant_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;