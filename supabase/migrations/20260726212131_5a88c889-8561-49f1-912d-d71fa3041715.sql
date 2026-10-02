CREATE OR REPLACE FUNCTION public.gateway_inventory_sensor_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled text;
  v_value numeric;
  v_meter record;
  v_prev record;
BEGIN
  SELECT value INTO v_enabled
  FROM public.system_settings
  WHERE key = 'sensor_history_enabled';

  IF lower(coalesce(v_enabled, 'true')) IN ('false', '0', 'off') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_value := replace(nullif(btrim(coalesce(NEW.state, '')), ''), ',', '.')::numeric;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF v_value IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_meter IN
    SELECT id, tenant_id, sensor_uuid
    FROM public.meters
    WHERE tenant_id = NEW.tenant_id
      AND is_archived = false
      AND sensor_uuid IS NOT NULL
      AND lower(sensor_uuid) = lower(NEW.entity_id)
      AND (
        NEW.location_integration_id IS NULL
        OR location_integration_id IS NULL
        OR location_integration_id = NEW.location_integration_id
      )
  LOOP
    SELECT value, recorded_at INTO v_prev
    FROM public.sensor_readings_raw
    WHERE meter_id = v_meter.id
    ORDER BY recorded_at DESC
    LIMIT 1;

    IF v_prev.recorded_at IS NOT NULL THEN
      IF abs(v_value - v_prev.value) = 0
         AND v_prev.recorded_at > now() - interval '5 minutes' THEN
        CONTINUE;
      END IF;

      IF abs(v_value - v_prev.value) < 0.05
         AND (CASE WHEN v_prev.value <> 0 THEN abs(v_value - v_prev.value) / abs(v_prev.value) ELSE 999 END) < 0.01
         AND v_prev.recorded_at > now() - interval '60 seconds' THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.sensor_readings_raw (tenant_id, meter_id, sensor_uuid, value, unit, recorded_at)
    VALUES (v_meter.tenant_id, v_meter.id, lower(v_meter.sensor_uuid), v_value, NEW.unit, coalesce(NEW.last_seen_at, now()));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gateway_inventory_sensor_history ON public.gateway_device_inventory;
CREATE TRIGGER trg_gateway_inventory_sensor_history
AFTER INSERT OR UPDATE OF state, unit, last_seen_at, last_state_at, location_integration_id
ON public.gateway_device_inventory
FOR EACH ROW
WHEN (NEW.state IS NOT NULL AND NEW.entity_id IS NOT NULL)
EXECUTE FUNCTION public.gateway_inventory_sensor_history();