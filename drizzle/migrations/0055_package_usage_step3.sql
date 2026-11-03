CREATE TABLE IF NOT EXISTS public.tenant_usage_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  locations integer NOT NULL DEFAULT 0,
  charge_points integer NOT NULL DEFAULT 0,
  active_charge_point_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day)
);
GRANT SELECT ON public.tenant_usage_daily TO authenticated;
GRANT ALL ON public.tenant_usage_daily TO service_role;
ALTER TABLE public.tenant_usage_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage daily portal or partner read" ON public.tenant_usage_daily;
CREATE POLICY "usage daily portal or partner read" ON public.tenant_usage_daily FOR SELECT TO authenticated
USING (public.can_portal_read(auth.uid(),'commercial') OR EXISTS (SELECT 1 FROM public.tenants t JOIN public.partner_members pm ON pm.partner_id=t.partner_id WHERE t.id=tenant_usage_daily.tenant_id AND pm.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS public.partner_usage_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, day)
);
GRANT SELECT, UPDATE ON public.partner_usage_notices TO authenticated;
GRANT ALL ON public.partner_usage_notices TO service_role;
ALTER TABLE public.partner_usage_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage notices read" ON public.partner_usage_notices;
CREATE POLICY "usage notices read" ON public.partner_usage_notices FOR SELECT TO authenticated
USING (public.can_portal_read(auth.uid(),'commercial') OR EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.partner_id=partner_usage_notices.partner_id AND pm.user_id=auth.uid()));
DROP POLICY IF EXISTS "usage notices mark read" ON public.partner_usage_notices;
CREATE POLICY "usage notices mark read" ON public.partner_usage_notices FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.partner_id=partner_usage_notices.partner_id AND pm.user_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.partner_id=partner_usage_notices.partner_id AND pm.user_id=auth.uid()));

ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS usage_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS usage_delta text;

-- Täglicher Mengen-Snapshot (nur lesend auf technische Daten)
CREATE OR REPLACE FUNCTION public.snapshot_tenant_usage(p_day date DEFAULT ((now() AT TIME ZONE 'Europe/Berlin')::date - 1)) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from timestamptz := (p_day::timestamp AT TIME ZONE 'Europe/Berlin'); v_to timestamptz := ((p_day+1)::timestamp AT TIME ZONE 'Europe/Berlin'); n integer; r record; prev record; v_month text;
BEGIN
INSERT INTO tenant_usage_daily(tenant_id,day,locations,charge_points,active_charge_point_ids)
SELECT t.id, p_day,
  (SELECT count(*) FROM locations l WHERE l.tenant_id=t.id AND NOT coalesce(l.is_archived,false) AND l.created_at < v_to),
  coalesce(array_length(ids.a,1),0), coalesce(ids.a,'{}')
FROM tenants t
LEFT JOIN LATERAL (SELECT array_agg(DISTINCT cp.id) a FROM charge_points cp WHERE cp.tenant_id=t.id AND (
  (cp.last_heartbeat >= v_from AND cp.last_heartbeat < v_to)
  OR EXISTS (SELECT 1 FROM charge_point_uptime_snapshots s WHERE s.charge_point_id=cp.id AND s.is_online AND s.recorded_at >= v_from AND s.recorded_at < v_to)
  OR (cp.ws_connected AND p_day = (now() AT TIME ZONE 'Europe/Berlin')::date - 1))) ids ON true
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id,day) DO UPDATE SET locations=EXCLUDED.locations, charge_points=EXCLUDED.charge_points, active_charge_point_ids=EXCLUDED.active_charge_point_ids;
GET DIAGNOSTICS n = ROW_COUNT;
-- Partner einmal täglich gesammelt informieren, wenn sich Mengen ändern
v_month := to_char(p_day,'MM/YYYY');
FOR r IN SELECT d.*, t.partner_id, t.name FROM tenant_usage_daily d JOIN tenants t ON t.id=d.tenant_id WHERE d.day=p_day AND t.partner_id IS NOT NULL LOOP
  SELECT * INTO prev FROM tenant_usage_daily WHERE tenant_id=r.tenant_id AND day=p_day-1;
  IF FOUND AND (prev.charge_points<>r.charge_points OR prev.locations<>r.locations) THEN
    INSERT INTO partner_usage_notices(partner_id,tenant_id,day,message) VALUES (r.partner_id,r.tenant_id,p_day,
      'Ab ' || v_month || ' werden für ' || r.name || ' ' ||
      concat_ws(' und ',
        CASE WHEN prev.charge_points<>r.charge_points THEN r.charge_points || ' statt ' || prev.charge_points || ' Ladepunkte' END,
        CASE WHEN prev.locations<>r.locations THEN r.locations || ' statt ' || prev.locations || ' Liegenschaften' END) || ' berechnet.')
    ON CONFLICT (tenant_id,day) DO UPDATE SET message=EXCLUDED.message;
  END IF;
END LOOP;
RETURN n; END $$;
REVOKE ALL ON FUNCTION public.snapshot_tenant_usage(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_tenant_usage(date) TO service_role;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  PERFORM cron.schedule('snapshot-tenant-usage','20 0 * * *','SELECT public.snapshot_tenant_usage();');
END IF; END $$;

-- Neue Mandanten werden von Anfang an nach Paketen abgerechnet (Bestandskunden bleiben unverändert)
CREATE OR REPLACE FUNCTION public.default_package_billing_for_new_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
NEW.package_billing := true;
NEW.package_billing_from := date_trunc('month',(now() AT TIME ZONE 'Europe/Berlin'))::date;
NEW.package_billing_set_at := now();
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_default_package_billing ON public.tenants;
CREATE TRIGGER trg_default_package_billing BEFORE INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.default_package_billing_for_new_tenant();