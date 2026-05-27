
-- ============================================================
-- ITER C: Energy Sharing Phase 2 Tables
-- ============================================================

-- Extend MSCONS imports
ALTER TABLE public.smart_meter_mscons_imports
  ADD COLUMN IF NOT EXISTS parsed_intervals integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS error_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.energy_communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mscons_imports_community ON public.smart_meter_mscons_imports(community_id);

-- Add data quality threshold
ALTER TABLE public.energy_communities
  ADD COLUMN IF NOT EXISTS data_quality_threshold_pct numeric(5,2) NOT NULL DEFAULT 80.0;

-- ============================================================
-- 1. 15-min readings per member (from MSCONS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_member_readings_15min (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  ts_start timestamptz NOT NULL,
  kwh numeric(12,4) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('consumption','feed_in')),
  source text NOT NULL DEFAULT 'mscons',
  import_id uuid REFERENCES public.smart_meter_mscons_imports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, ts_start, direction)
);

CREATE INDEX IF NOT EXISTS idx_cmr15_community_ts ON public.community_member_readings_15min(community_id, ts_start);
CREATE INDEX IF NOT EXISTS idx_cmr15_tenant ON public.community_member_readings_15min(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_member_readings_15min TO authenticated;
GRANT ALL ON public.community_member_readings_15min TO service_role;

ALTER TABLE public.community_member_readings_15min ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manages own readings"
  ON public.community_member_readings_15min
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- 2. Allocation runs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_allocation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  strategy text NOT NULL DEFAULT 'static_share',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  total_generated_kwh numeric(14,4) DEFAULT 0,
  total_allocated_kwh numeric(14,4) DEFAULT 0,
  total_surplus_kwh numeric(14,4) DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_car_community ON public.community_allocation_runs(community_id, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_allocation_runs TO authenticated;
GRANT ALL ON public.community_allocation_runs TO service_role;

ALTER TABLE public.community_allocation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant views own allocation runs"
  ON public.community_allocation_runs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- 3. Allocations 15min
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_allocations_15min (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.community_allocation_runs(id) ON DELETE SET NULL,
  ts_start timestamptz NOT NULL,
  allocated_kwh numeric(12,4) NOT NULL DEFAULT 0,
  surplus_to_grid_kwh numeric(12,4) NOT NULL DEFAULT 0,
  strategy text NOT NULL DEFAULT 'static_share',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, ts_start)
);

CREATE INDEX IF NOT EXISTS idx_ca15_community_ts ON public.community_allocations_15min(community_id, ts_start);
CREATE INDEX IF NOT EXISTS idx_ca15_member_ts ON public.community_allocations_15min(member_id, ts_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_allocations_15min TO authenticated;
GRANT ALL ON public.community_allocations_15min TO service_role;

ALTER TABLE public.community_allocations_15min ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manages own allocations"
  ON public.community_allocations_15min
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Members see own allocations"
  ON public.community_allocations_15min
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = community_allocations_15min.member_id
        AND cm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- ============================================================
-- 4. Monthly member invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_member_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.energy_communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  invoice_number text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  allocated_kwh numeric(12,4) NOT NULL DEFAULT 0,
  feed_in_kwh numeric(12,4) NOT NULL DEFAULT 0,
  internal_amount_ct integer NOT NULL DEFAULT 0,
  feed_in_credit_ct integer NOT NULL DEFAULT 0,
  total_ct integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','voided')),
  pdf_path text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_cmi_community_period ON public.community_member_invoices(community_id, period_start);
CREATE INDEX IF NOT EXISTS idx_cmi_member ON public.community_member_invoices(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_member_invoices TO authenticated;
GRANT ALL ON public.community_member_invoices TO service_role;

ALTER TABLE public.community_member_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manages own invoices"
  ON public.community_member_invoices
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Members see own invoices"
  ON public.community_member_invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = community_member_invoices.member_id
        AND cm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE TRIGGER trg_cmi_updated_at BEFORE UPDATE ON public.community_member_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Storage bucket for invoice PDFs (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('community-invoices', 'community-invoices', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tenant reads own community invoice PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-invoices'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );

CREATE POLICY "Service role writes community invoice PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-invoices'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenant deletes own community invoice PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-invoices'
    AND split_part(name, '/', 1) = public.get_user_tenant_id()::text
  );

-- ============================================================
-- 6. Data quality function
-- ============================================================
CREATE OR REPLACE FUNCTION public.community_data_quality(p_community_id uuid)
RETURNS TABLE(
  members_total integer,
  members_with_recent_data integer,
  coverage_pct numeric,
  last_reading_at timestamptz,
  assets_total integer,
  active_run_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM public.community_members WHERE community_id = p_community_id AND status = 'active') AS members_total,
    (SELECT count(DISTINCT cm.id)::int FROM public.community_members cm
       JOIN public.community_member_readings_15min r ON r.member_id = cm.id
       WHERE cm.community_id = p_community_id
         AND cm.status = 'active'
         AND r.ts_start > now() - interval '7 days'
    ) AS members_with_recent_data,
    CASE
      WHEN (SELECT count(*) FROM public.community_members WHERE community_id = p_community_id AND status = 'active') = 0 THEN 0::numeric
      ELSE ROUND(
        (SELECT count(DISTINCT cm.id)::numeric FROM public.community_members cm
           JOIN public.community_member_readings_15min r ON r.member_id = cm.id
           WHERE cm.community_id = p_community_id AND cm.status = 'active'
             AND r.ts_start > now() - interval '7 days')
        * 100.0
        / (SELECT count(*) FROM public.community_members WHERE community_id = p_community_id AND status = 'active'),
        1)
    END AS coverage_pct,
    (SELECT max(r.ts_start) FROM public.community_member_readings_15min r
       JOIN public.community_members cm ON cm.id = r.member_id
       WHERE cm.community_id = p_community_id) AS last_reading_at,
    (SELECT count(*)::int FROM public.community_assets WHERE community_id = p_community_id) AS assets_total,
    (SELECT max(completed_at) FROM public.community_allocation_runs
       WHERE community_id = p_community_id AND status = 'completed') AS active_run_at
  WHERE EXISTS (
    SELECT 1 FROM public.energy_communities
    WHERE id = p_community_id
      AND (tenant_id = v_tenant OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  );
END;
$$;
