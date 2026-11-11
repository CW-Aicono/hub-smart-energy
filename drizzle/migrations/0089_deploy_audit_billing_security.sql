CREATE OR REPLACE FUNCTION public._finish_tenant_setup(_tenant_id uuid, _by uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date; s record;
BEGIN
 UPDATE public.tenants SET setup_status='active',setup_completed_at=now(),setup_completed_by=_by WHERE id=_tenant_id AND setup_status='setup';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count=0 THEN RETURN false; END IF;
 UPDATE public.support_sessions SET ended_at=now() WHERE tenant_id=_tenant_id AND session_kind='setup' AND ended_at IS NULL;
 FOR s IN SELECT ls.* FROM public.license_sales ls WHERE ls.tenant_id=_tenant_id
 AND (ls.ended_on IS NULL OR ls.ended_on>=v_today OR (ls.auto_renew=false AND ls.term_months IS NOT NULL AND ls.ended_on=public.license_term_end(ls.starts_on,ls.term_months)))
 AND NOT EXISTS(SELECT 1 FROM public.license_sale_corrections c WHERE c.sale_id=ls.id AND c.after_data->>'action'='cancel_mistake')
 AND NOT EXISTS(SELECT 1 FROM public.license_billing_events e WHERE e.sale_id=ls.id) ORDER BY ls.created_at LOOP
 UPDATE public.license_sales SET starts_on=v_today,next_period=v_today,
 ended_on=CASE WHEN s.auto_renew=false AND s.term_months IS NOT NULL AND s.ended_on=public.license_term_end(s.starts_on,s.term_months) THEN public.license_term_end(v_today,s.term_months) ELSE s.ended_on END WHERE id=s.id;
 PERFORM public.bill_license_sale(s.id,v_today,true);
 END LOOP;
 BEGIN
 INSERT INTO public.audit_logs(actor_user_id,tenant_id,action,entity_type,entity_id,metadata) VALUES(_by,_tenant_id,'tenant_setup_completed','tenant',_tenant_id,jsonb_build_object('reason',_reason,'billing_start',v_today));
 EXCEPTION WHEN others THEN NULL; END;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._finish_tenant_setup(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_license_sale_term(p_sale uuid,p_term_months integer,p_auto_renew boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s license_sales; v_end date; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
 SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR NOT coalesce((can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(s.partner_id)),false) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 IF EXISTS(SELECT 1 FROM license_sale_corrections c WHERE c.sale_id=s.id AND c.after_data->>'action'='cancel_mistake') THEN RAISE EXCEPTION 'Fehlbuchung wurde zurückgenommen'; END IF;
 IF p_term_months IS NOT NULL AND (p_term_months<1 OR p_term_months>240) THEN RAISE EXCEPTION 'Laufzeit 1 bis 240 Monate'; END IF;
 IF s.cadence='once' AND s.product_code<>'setup' AND p_term_months IS NULL THEN RAISE EXCEPTION 'Einmalzahlung braucht eine Laufzeit'; END IF;
 IF s.ended_on IS NOT NULL AND s.ended_on<today AND NOT EXISTS(SELECT 1 FROM tenants WHERE id=s.tenant_id AND setup_status='setup') THEN RAISE EXCEPTION 'Vertrag ist bereits beendet'; END IF;
 v_end:=license_term_end(s.starts_on,p_term_months);
 IF NOT p_auto_renew AND v_end IS NOT NULL AND v_end<today AND NOT EXISTS(SELECT 1 FROM tenants WHERE id=s.tenant_id AND setup_status='setup') THEN RAISE EXCEPTION 'Laufzeitende liegt in der Vergangenheit'; END IF;
 UPDATE license_sales SET term_months=p_term_months,auto_renew=CASE WHEN s.ended_on IS NOT NULL THEN false ELSE coalesce(p_auto_renew,true) END,
 ended_on=CASE WHEN s.ended_on IS NOT NULL THEN least(s.ended_on,CASE WHEN NOT coalesce(p_auto_renew,true) THEN v_end ELSE s.ended_on END) WHEN NOT coalesce(p_auto_renew,true) AND v_end IS NOT NULL THEN v_end ELSE NULL END WHERE id=p_sale;
 UPDATE license_sales SET next_period=coalesce(next_period,(SELECT max(period_end)+1 FROM license_billing_events WHERE sale_id=p_sale)) WHERE id=p_sale AND cadence<>'once' AND (ended_on IS NULL OR coalesce(next_period,(SELECT max(period_end)+1 FROM license_billing_events WHERE sale_id=p_sale))<=ended_on);
 IF s.cadence='once' AND s.product_code<>'setup' AND NOT EXISTS(SELECT 1 FROM license_billing_events WHERE sale_id=p_sale) THEN PERFORM bill_license_sale(p_sale,s.starts_on,true); END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_license_sale_term(uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_license_sale_term(uuid,integer,boolean) TO authenticated;
COMMENT ON FUNCTION public._finish_tenant_setup(uuid,uuid,text) IS 'deploy_audit_v1442: handover rebases unbilled fixed terms, preserves cancellations';
COMMENT ON FUNCTION public.set_license_sale_term(uuid,integer,boolean) IS 'deploy_audit_v1442: preserves existing termination';
DO $security$ BEGIN
 IF to_regclass('public.meter_daily_totals_mv_repair_backup_20260617') IS NOT NULL THEN
 ALTER TABLE public.meter_daily_totals_mv_repair_backup_20260617 ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.meter_daily_totals_mv_repair_backup_20260617 FROM PUBLIC,anon,authenticated;
 GRANT ALL ON public.meter_daily_totals_mv_repair_backup_20260617 TO service_role;
 END IF;
END $security$;
DROP POLICY IF EXISTS "Authenticated users can read bridge_workers" ON public.bridge_workers;
REVOKE ALL ON public.bridge_workers FROM PUBLIC,anon;
GRANT ALL ON public.bridge_workers TO service_role;
NOTIFY pgrst,'reload schema';