ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS source_charge_point_id uuid NULL REFERENCES public.charge_points(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS meters_source_charge_point_uidx ON public.meters (source_charge_point_id) WHERE source_charge_point_id IS NOT NULL;
COMMENT ON COLUMN public.meters.source_charge_point_id IS 'Automatisch gepflegter Zähler eines Ladepunkts (Name/Liegenschaft folgen dem Ladepunkt).';

CREATE OR REPLACE FUNCTION public.sync_charge_point_meter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_meter uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.meters SET is_archived = true WHERE source_charge_point_id = OLD.id;
    RETURN OLD;
  END IF;
  SELECT id INTO v_meter FROM public.meters WHERE source_charge_point_id = NEW.id;
  IF v_meter IS NULL THEN
    -- Bereits manuell verknüpfter Zähler: nicht doppelt anlegen
    IF NEW.linked_meter_id IS NOT NULL OR NEW.location_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.meters (tenant_id, location_id, name, energy_type, unit, capture_type, device_type, meter_function, source_charge_point_id, notes)
    VALUES (NEW.tenant_id, NEW.location_id, NEW.name, 'strom', 'kWh', 'automatic', 'meter', 'consumption', NEW.id, 'Ladepunkt ' || coalesce(NEW.ocpp_id, ''))
    RETURNING id INTO v_meter;
    UPDATE public.charge_points SET linked_meter_id = v_meter WHERE id = NEW.id;
  ELSE
    UPDATE public.meters SET
      name = NEW.name,
      location_id = coalesce(NEW.location_id, location_id),
      is_archived = (NEW.location_id IS NULL)
    WHERE id = v_meter;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_charge_point_meter: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_charge_point_meter ON public.charge_points;
CREATE TRIGGER trg_sync_charge_point_meter AFTER INSERT OR UPDATE OF name, location_id ON public.charge_points
  FOR EACH ROW EXECUTE FUNCTION public.sync_charge_point_meter();
DROP TRIGGER IF EXISTS trg_sync_charge_point_meter_del ON public.charge_points;
CREATE TRIGGER trg_sync_charge_point_meter_del BEFORE DELETE ON public.charge_points
  FOR EACH ROW EXECUTE FUNCTION public.sync_charge_point_meter();

-- Backfill: Zähler für bestehende Ladepunkte mit Liegenschaft und ohne Verknüpfung
INSERT INTO public.meters (tenant_id, location_id, name, energy_type, unit, capture_type, device_type, meter_function, source_charge_point_id, notes)
SELECT cp.tenant_id, cp.location_id, cp.name, 'strom', 'kWh', 'automatic', 'meter', 'consumption', cp.id, 'Ladepunkt ' || coalesce(cp.ocpp_id, '')
FROM public.charge_points cp
WHERE cp.location_id IS NOT NULL AND cp.linked_meter_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.source_charge_point_id = cp.id);
UPDATE public.charge_points cp SET linked_meter_id = m.id
FROM public.meters m WHERE m.source_charge_point_id = cp.id AND cp.linked_meter_id IS NULL;

-- Historie: Leistung als 5-Minuten-Werte (kW), Zählerstand stündlich (kWh)
INSERT INTO public.meter_power_readings_5min (meter_id, tenant_id, energy_type, power_avg, power_max, bucket, sample_count, resolution_minutes, source)
SELECT m.id, m.tenant_id, 'electricity',
  avg(CASE WHEN upper(coalesce(s.unit,'W'))='KW' THEN s.value ELSE s.value/1000 END),
  max(CASE WHEN upper(coalesce(s.unit,'W'))='KW' THEN s.value ELSE s.value/1000 END),
  to_timestamp(floor(extract(epoch FROM s.sampled_at)/300)*300), count(*)::int, 5, 'ocpp_backfill'
FROM public.ocpp_meter_samples s JOIN public.meters m ON m.source_charge_point_id = s.charge_point_id
WHERE s.measurand = 'Power.Active.Import' AND s.phase IS NULL
GROUP BY m.id, m.tenant_id, to_timestamp(floor(extract(epoch FROM s.sampled_at)/300)*300)
ON CONFLICT DO NOTHING;

INSERT INTO public.meter_cumulative_readings (tenant_id, meter_id, reading_at, kwh_total, source)
SELECT DISTINCT ON (m.id, date_trunc('hour', s.sampled_at)) m.tenant_id, m.id, s.sampled_at,
  CASE WHEN upper(coalesce(s.unit,'KWH'))='WH' THEN s.value/1000 ELSE s.value END, 'ocpp'
FROM public.ocpp_meter_samples s JOIN public.meters m ON m.source_charge_point_id = s.charge_point_id
WHERE s.measurand = 'Energy.Active.Import.Register' AND s.phase IS NULL AND s.value > 0
ORDER BY m.id, date_trunc('hour', s.sampled_at), s.sampled_at DESC
ON CONFLICT DO NOTHING;