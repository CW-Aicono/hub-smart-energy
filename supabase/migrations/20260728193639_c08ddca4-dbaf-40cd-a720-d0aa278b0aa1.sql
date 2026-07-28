CREATE OR REPLACE FUNCTION public.merge_duplicate_meter(_master_id uuid, _duplicate_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF lower(coalesce(_master.sensor_uuid,'')) <> lower(coalesce(_dup.sensor_uuid,'')) THEN
    RAISE EXCEPTION 'meters do not share the same sensor_uuid';
  END IF;

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

  DELETE FROM public.virtual_meter_sources d
    WHERE d.source_meter_id = _dup.id
      AND EXISTS (
        SELECT 1 FROM public.virtual_meter_sources m
        WHERE m.virtual_meter_id = d.virtual_meter_id
          AND m.source_meter_id = _master.id
      );
  UPDATE public.virtual_meter_sources SET source_meter_id = _master.id WHERE source_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('virtual_meter_sources', _cnt);

  UPDATE public.meters SET parent_meter_id = _master.id WHERE parent_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('child_meters_reparented', _cnt);

  UPDATE public.meters SET replaces_meter_id = _master.id WHERE replaces_meter_id = _dup.id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('replaces_meter_id', _cnt);

  UPDATE public.dashboard_widgets
     SET config = replace(config::text, _dup.id::text, _master.id::text)::jsonb
   WHERE config::text LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('dashboard_widgets_rewritten', _cnt);

  UPDATE public.custom_widget_definitions
     SET config = replace(config::text, _dup.id::text, _master.id::text)::jsonb
   WHERE config::text LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('custom_widget_definitions_rewritten', _cnt);

  -- location_automations: conditions/actions JSON may reference the meter id
  UPDATE public.location_automations
     SET conditions = CASE WHEN conditions::text LIKE '%' || _dup.id::text || '%'
                           THEN replace(conditions::text, _dup.id::text, _master.id::text)::jsonb
                           ELSE conditions END,
         actions    = CASE WHEN actions::text LIKE '%' || _dup.id::text || '%'
                           THEN replace(actions::text, _dup.id::text, _master.id::text)::jsonb
                           ELSE actions END
   WHERE conditions::text LIKE '%' || _dup.id::text || '%'
      OR actions::text    LIKE '%' || _dup.id::text || '%';
  GET DIAGNOSTICS _cnt = ROW_COUNT; _stats := _stats || jsonb_build_object('location_automations_rewritten', _cnt);

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

  UPDATE public.meters
     SET is_archived = true,
         sensor_uuid = NULL,
         location_integration_id = NULL,
         notes = COALESCE(
           '[MERGED into ' || _master.id::text || ' at ' || now()::text || E']\n' || notes,
           '[MERGED into ' || _master.id::text || ' at ' || now()::text || ']'
         )
   WHERE id = _dup.id;

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
$function$;