
-- =========================================================================
-- Hebel #1: Ungenutzte / redundante Indizes droppen
-- =========================================================================

-- meter_power_readings_5min: 0 scans, 177 MB
DROP INDEX IF EXISTS public.meter_power_readings_5min_tenant_meter_bucket_idx;

-- meter_power_readings: redundante/ungenutzte Indizes
DROP INDEX IF EXISTS public.idx_meter_power_readings_meter_time;          -- duplicate von idx_mpr_meter_recorded
DROP INDEX IF EXISTS public.idx_mpr_tenant_recorded_at;                   -- 0 scans, 10 MB
DROP INDEX IF EXISTS public.idx_meter_power_readings_created_at_brin;     -- 0 scans

-- =========================================================================
-- Hebel #2: Delta-Guard für Snapshot-Writes
--   Verhindert UPDATE, wenn sich der fachliche Payload nicht geändert hat.
--   Spart WAL/IO bei unveränderten Sensor-/Zähler-Werten.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.gateway_sensor_snapshots_delta_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.sensors         IS NOT DISTINCT FROM OLD.sensors
     AND NEW.system_messages IS NOT DISTINCT FROM OLD.system_messages
     AND NEW.status          IS NOT DISTINCT FROM OLD.status
     AND NEW.error_message   IS NOT DISTINCT FROM OLD.error_message
  THEN
    RETURN NULL;  -- suppress write, no WAL/IO
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gateway_sensor_snapshots_delta_guard ON public.gateway_sensor_snapshots;
CREATE TRIGGER trg_gateway_sensor_snapshots_delta_guard
BEFORE UPDATE ON public.gateway_sensor_snapshots
FOR EACH ROW EXECUTE FUNCTION public.gateway_sensor_snapshots_delta_guard();

CREATE OR REPLACE FUNCTION public.meter_loxone_daily_snapshots_delta_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.energy_total_kwh IS NOT DISTINCT FROM OLD.energy_total_kwh
     AND NEW.energy_today_kwh IS NOT DISTINCT FROM OLD.energy_today_kwh
     AND NEW.source           IS NOT DISTINCT FROM OLD.source
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mlds_delta_guard ON public.meter_loxone_daily_snapshots;
CREATE TRIGGER trg_mlds_delta_guard
BEFORE UPDATE ON public.meter_loxone_daily_snapshots
FOR EACH ROW EXECUTE FUNCTION public.meter_loxone_daily_snapshots_delta_guard();

-- =========================================================================
-- Hebel #3: Autovacuum + Fillfactor-Tuning der Hot-Write-Tabellen
--   Reduziert Bloat, HOT-Updates statt Index-Rewrites, weniger IO.
-- =========================================================================

ALTER TABLE public.meter_power_readings SET (
  fillfactor = 90,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_limit = 2000
);

ALTER TABLE public.meter_power_readings_5min SET (
  fillfactor = 90,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.gateway_sensor_snapshots SET (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.meter_loxone_daily_snapshots SET (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.bridge_raw_samples SET (
  fillfactor = 90,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- =========================================================================
-- Hebel #6: Retention für meter_power_readings (Rohdaten 90 Tage)
--   Aggregate in meter_power_readings_5min / _period_totals bleiben unberührt.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.purge_meter_power_readings_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
  v_batch   bigint;
BEGIN
  LOOP
    WITH del AS (
      DELETE FROM public.meter_power_readings
      WHERE ctid IN (
        SELECT ctid FROM public.meter_power_readings
        WHERE recorded_at < now() - INTERVAL '90 days'
        LIMIT 10000
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM del;
    EXIT WHEN v_batch = 0;
    v_deleted := v_deleted + v_batch;
    PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE NOTICE 'purge_meter_power_readings_retention: % rows deleted', v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_meter_power_readings_retention() FROM PUBLIC;

-- Alten Cron-Job (falls vorhanden) neu einplanen: täglich um 02:15 UTC
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'purge_meter_power_readings_retention';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'purge_meter_power_readings_retention',
    '15 2 * * *',
    $cron$SELECT public.purge_meter_power_readings_retention();$cron$
  );
END $$;
