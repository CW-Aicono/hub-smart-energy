-- Trigger to sync room_id from floor_sensor_positions to meters
CREATE OR REPLACE FUNCTION public.sync_meter_room_from_sensor_position()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the meter's room_id when a sensor position is inserted or updated
  UPDATE public.meters
  SET room_id = NEW.room_id
  WHERE sensor_uuid = NEW.sensor_uuid
    AND floor_id = NEW.floor_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER sync_meter_room_on_sensor_position_change
AFTER INSERT OR UPDATE ON public.floor_sensor_positions
FOR EACH ROW
EXECUTE FUNCTION public.sync_meter_room_from_sensor_position();

-- Also handle when sensor position is deleted - clear room_id on meter
CREATE OR REPLACE FUNCTION public.clear_meter_room_on_sensor_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.meters
  SET room_id = NULL
  WHERE sensor_uuid = OLD.sensor_uuid
    AND floor_id = OLD.floor_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER clear_meter_room_on_sensor_position_delete
AFTER DELETE ON public.floor_sensor_positions
FOR EACH ROW
EXECUTE FUNCTION public.clear_meter_room_on_sensor_delete();