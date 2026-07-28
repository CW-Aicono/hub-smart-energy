-- =============================================================
-- Prevent duplicate meters + safe merge helper
-- =============================================================

-- 1) Detector: list all active meter duplicates grouped by tenant + integration + sensor uuid
CREATE OR REPLACE FUNCTION public.find_duplicate_meters()
RETURNS TABLE(
  tenant_id uuid,
  location_integration_id uuid,
  sensor_uuid_key text,
  meter_ids uuid[],
  duplicate_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.tenant_id,
    m.location_integration_id,
    lower(m.sensor_uuid) AS sensor_uuid_key,
    array_agg(m.id ORDER BY m.created_at) AS meter_ids,
    count(*)::int AS duplicate_count
  FROM public.meters m
  WHERE m.sensor_uuid IS NOT NULL
    AND m.is_archived = false
  GROUP BY m.tenant_id, m.location_integration_id, lower(m.sensor_uuid)
  HAVING count(*) > 1;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_meters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_meters() TO service_role;

-- 2) Merger: safely merges a duplicate meter into a master meter.
--    Called ONLY from the meters-merge-duplicates edge function (service role).
CREATE OR REPLACE FUNCTION public.merge_duplicate_meter(
  _master_id uuid,
  _duplicate_id uuid,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _master  record;
  _dup     record;
  _stats   jsonb := '{}'::jsonb;
  _cnt     bigint;
BEGIN
  IF _master_id IS NULL OR _duplicate_id IS NULL THEN
    RAISE EXCEPTION 'master_id and duplicate_id are required';
  END IF;
  IF _master_id = _duplicate_id THEN
    RAISE EXCEPTION 'master and duplicate must differ';
  END IF;

  SELECT id, tenant_id, location_integration_id, sensor_uuid, is_archived
    INTO _master FROM public.meters WHERE id = _master_id;
  SELECT id, tenant_id, location_integration_id, sensor_uuid, is_archived, name
    INTO _dup    FROM public.meters WHERE id = _duplicate_id;

  IF _master.id IS NULL THEN RAISE EXCEPTION 'master meter not found'; END IF;
  IF _dup.id    IS NULL THEN RAISE EXCEPTION 'duplicate meter not found'; END IF;
  IF _master.tenant_id <> _dup.tenant_id THEN
    RAISE EXCEPTION 'meters belong to different tenants';
  END IF;
  IF _dup.is_archived THEN
    RAISE EXCEPTION 'duplicate meter is already archived';
  END IF;

  -- Guard: only merge when both meters point at the same sensor (case-insensitive).
  IF lower(coalesce(_master.sensor_uuid,'')) <> lower(coalesce(_dup.sensor_uuid,'')) THEN
    RAISE EXCEPTION 'meters do not share the same sensor_uuid';
  END IF;

  ---------------------------------------------------------------
  -- A) Reassign reference/config rows to master
  ---------------------------------------------------------------
  UPDATE public.alert_rules                      SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('alert_rules', _cnt);

  UPDATE public.energy_prices                    SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('energy_prices', _cnt);

  UPDATE public.charge_points                    SET linked_meter_id = _master.id WHERE linked_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('charge_points_linked', _cnt);

  UPDATE public.energy_storages                  SET power_meter_id = _master.id WHERE power_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('energy_storages', _cnt);

  UPDATE public.pv_forecast_settings             SET pv_meter_id = _master.id WHERE pv_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('pv_forecast_settings', _cnt);

  UPDATE public.solar_charging_config            SET reference_meter_id = _master.id WHERE reference_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('solar_charging_config', _cnt);

  UPDATE public.gateway_device_entities          SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('gateway_device_entities', _cnt);

  UPDATE public.smart_meter_consents             SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('smart_meter_consents', _cnt);

  UPDATE public.ppa_contracts                    SET plant_id = _master.id WHERE plant_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('ppa_contracts', _cnt);

  UPDATE public.ppa_onsite_config                SET generation_meter_id = _master.id WHERE generation_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('ppa_onsite_config', _cnt);

  UPDATE public.ppa_consumption_meters           SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('ppa_consumption_meters', _cnt);

  UPDATE public.tenant_electricity_tenants       SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('tenant_electricity_tenants', _cnt);

  UPDATE public.tenant_electricity_settings      SET grid_meter_id = _master.id WHERE grid_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('tenant_electricity_settings_grid', _cnt);

  UPDATE public.tenant_electricity_settings      SET pv_meter_id = _master.id WHERE pv_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('tenant_electricity_settings_pv', _cnt);

  UPDATE public.tenant_electricity_tenant_meters SET meter_id = _master.id WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('tenant_electricity_tenant_meters', _cnt);

  -- virtual_meter_sources.source_meter_id: prevent duplicating (virtual_meter_id, source_meter_id)
  -- Just delete conflicts on dup, then reassign remaining
  DELETE FROM public.virtual_meter_sources d
    WHERE d.source_meter_id = _dup.id
      AND EXISTS (
        SELECT 1 FROM public.virtual_meter_sources m
        WHERE m.virtual_meter_id = d.virtual_meter_id
          AND m.source_meter_id = _master.id
      );
  UPDATE public.virtual_meter_sources SET source_meter_id = _master.id WHERE source_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('virtual_meter_sources', _cnt);

  -- Meter tree: children under dup → master
  UPDATE public.meters SET parent_meter_id = _master.id WHERE parent_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('child_meters_reparented', _cnt);

  UPDATE public.meters SET replaces_meter_id = _master.id WHERE replaces_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('replaces_meter_id', _cnt);

  ---------------------------------------------------------------
  -- B) Reference JSONB tables (widgets, automations) - rewrite meter IDs
  ---------------------------------------------------------------
  -- dashboard_widgets: config JSON may contain the meter id anywhere.
  UPDATE public.dashboard_widgets
     SET config = replace(config::text, _dup.id::text, _master.id::text)::jsonb
   WHERE config::text LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('dashboard_widgets_rewritten', _cnt);

  -- custom_widget_definitions
  UPDATE public.custom_widget_definitions
     SET config = replace(config::text, _dup.id::text, _master.id::text)::jsonb
   WHERE config::text LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('custom_widget_definitions_rewritten', _cnt);

  -- location_automations: trigger/action JSON may reference the meter id
  UPDATE public.location_automations
     SET trigger_config = CASE WHEN trigger_config::text LIKE '%' || _dup.id::text || '%'
                               THEN replace(trigger_config::text, _dup.id::text, _master.id::text)::jsonb
                               ELSE trigger_config END,
         action_config  = CASE WHEN action_config::text LIKE '%' || _dup.id::text || '%'
                               THEN replace(action_config::text, _dup.id::text, _master.id::text)::jsonb
                               ELSE action_config END
   WHERE trigger_config::text LIKE '%' || _dup.id::text || '%'
      OR action_config::text  LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('location_automations_rewritten', _cnt);

  ---------------------------------------------------------------
  -- C) History tables → delete on duplicate (master has identical fanned values).
  ---------------------------------------------------------------
  DELETE FROM public.meter_readings                    WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_readings_deleted', _cnt);

  DELETE FROM public.meter_power_readings              WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_power_readings_deleted', _cnt);

  DELETE FROM public.meter_power_readings_5min         WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_power_readings_5min_deleted', _cnt);

  DELETE FROM public.meter_power_readings_5min_bridge  WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_power_readings_5min_bridge_deleted', _cnt);

  DELETE FROM public.meter_cumulative_readings         WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_cumulative_readings_deleted', _cnt);

  DELETE FROM public.meter_cumulative_readings_bridge  WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_cumulative_readings_bridge_deleted', _cnt);

  DELETE FROM public.meter_period_totals               WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_period_totals_deleted', _cnt);

  DELETE FROM public.meter_daily_totals_mv             WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_daily_totals_mv_deleted', _cnt);

  DELETE FROM public.meter_weekly_totals               WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_weekly_totals_deleted', _cnt);

  DELETE FROM public.meter_monthly_totals              WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_monthly_totals_deleted', _cnt);

  DELETE FROM public.meter_loxone_daily_snapshots      WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('meter_loxone_daily_snapshots_deleted', _cnt);

  DELETE FROM public.sensor_readings_raw               WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('sensor_readings_raw_deleted', _cnt);

  DELETE FROM public.sensor_readings_5min              WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('sensor_readings_5min_deleted', _cnt);

  DELETE FROM public.tenant_electricity_readings       WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('tenant_electricity_readings_deleted', _cnt);

  DELETE FROM public.pv_actual_hourly                  WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('pv_actual_hourly_deleted', _cnt);

  DELETE FROM public.simulation_meter_state            WHERE meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('simulation_meter_state_deleted', _cnt);

  ---------------------------------------------------------------
  -- D) Archive the duplicate; also detach its sensor to satisfy the future unique index.
  ---------------------------------------------------------------
  UPDATE public.meters
     SET is_archived = true,
         sensor_uuid = NULL,
         location_integration_id = NULL,
         notes = COALESCE(
           '[MERGED into ' || _master.id::text || ' at ' || now()::text || E']\n' || notes,
           '[MERGED into ' || _master.id::text || ' at ' || now()::text || ']'
         )
   WHERE id = _dup.id;

  ---------------------------------------------------------------
  -- E) Audit trail
  ---------------------------------------------------------------
  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, tenant_id, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    _actor_user_id, 'super_admin', _master.tenant_id,
    'meter_duplicate_merge', 'meter', _master.id, _dup.name,
    jsonb_build_object('merged_from', _dup.id, 'row_stats', _stats)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'master_id', _master.id,
    'duplicate_id', _dup.id,
    'row_stats', _stats
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_meter(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_meter(uuid, uuid, uuid) TO service_role;

-- 3) Conditional unique index: only create if no active duplicates remain.
DO $$
DECLARE
  _dupes int;
BEGIN
  SELECT count(*) INTO _dupes FROM public.find_duplicate_meters();
  IF _dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS meters_unique_active_sensor
      ON public.meters (tenant_id, location_integration_id, lower(sensor_uuid))
      WHERE sensor_uuid IS NOT NULL AND is_archived = false;
    RAISE NOTICE 'Unique index meters_unique_active_sensor created.';
  ELSE
    RAISE NOTICE 'Skipped unique index: % duplicate group(s) still exist. Merge them via Super-Admin and re-run.', _dupes;
  END IF;
END $$;
