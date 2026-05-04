-- Block 1: Deny-Policies für interne Tabellen
CREATE POLICY "Deny client access" ON public.charging_invoice_counter
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY "Deny client access" ON public.gateway_refresh_locks
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- Block 2: search_path für Funktion fixen
ALTER FUNCTION public.get_meter_daily_totals_split(uuid[], date, date) SET search_path = public;

-- Block 3: Überflüssige Service-Role-Policies droppen (Service-Role bypassed RLS)
DROP POLICY IF EXISTS "Service role full access" ON public.backup_snapshots;
DROP POLICY IF EXISTS "Service role manages invite tokens" ON public.invite_tokens;
DROP POLICY IF EXISTS "Service role can insert spot prices" ON public.spot_prices;
DROP POLICY IF EXISTS "Service role can delete spot prices" ON public.spot_prices;
DROP POLICY IF EXISTS "Service role full access on integration_errors" ON public.integration_errors;
DROP POLICY IF EXISTS "Service role can insert infrastructure metrics" ON public.infrastructure_metrics;
DROP POLICY IF EXISTS "Service role inserts access logs" ON public.charging_access_log;
DROP POLICY IF EXISTS "Service role manages active profiles" ON public.charge_point_active_profile;

-- Block 4: Listing-Lücke im Bucket charging-invoice-assets schließen
DROP POLICY IF EXISTS "Anyone can view invoice assets" ON storage.objects;

-- Tenant-scoped SELECT (verhindert LIST für Fremde, getPublicUrl bleibt funktionsfähig
-- weil das auf der Bucket-public=true Eigenschaft basiert, nicht auf der Policy)
CREATE POLICY "Tenant can list invoice assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'charging-invoice-assets'
    AND split_part(name, '/', 1) = (
      SELECT tenant_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Block 5: EXECUTE-Recht für interne Trigger/Cron-Funktionen entziehen
REVOKE EXECUTE ON FUNCTION public.aggregate_pv_actual_hourly(timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_resolve_integration_errors_on_sync_success() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_main_meter_no_parent() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_meter_hierarchy() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_charge_point_uptime_snapshots() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_backups() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_infra_metrics() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_ocpp_logs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collect_db_metrics() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compact_power_readings_day(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_daily_totals_from_5min(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_task_for_integration_error() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_simulator_instance_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_main_location() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_app_tag() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_privileged_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_user_role_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_task_for_integration_error() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_charge_point_uptime() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_meter_room_from_sensor_position() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_meter_room_on_sensor_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.charge_points_clear_password_when_no_auth() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_gateway_refresh_lock(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_gateway_refresh_lock(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_charging_invoice_number(uuid, integer) FROM anon, authenticated;