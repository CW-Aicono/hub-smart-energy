-- Stage 1b: Additive read-only RLS for partner members on all tenant-scoped public tables.
-- Existing policies remain untouched. We only ADD a permissive SELECT policy per table
-- that grants partner_members read access to rows belonging to tenants linked to their partner.

DO $$
DECLARE
  r record;
  v_policy_name text := 'Partner members can read tenant data';
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    -- Ensure RLS is enabled (no-op if already enabled)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);

    -- Skip if our additive policy already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = r.table_name
        AND policyname = v_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.partner_has_tenant_access(auth.uid(), tenant_id))',
        v_policy_name, r.table_name
      );
    END IF;

    -- Ensure authenticated has SELECT grant (additive; existing grants untouched)
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.table_name);
  END LOOP;
END $$;

-- Also expose tenants table itself for partner-admins (read-only on their tenants)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants'
      AND policyname = 'Partner members can read their tenants'
  ) THEN
    CREATE POLICY "Partner members can read their tenants"
      ON public.tenants
      FOR SELECT
      TO authenticated
      USING (
        partner_id IS NOT NULL
        AND partner_id = public.get_user_partner_id()
      );
  END IF;
END $$;