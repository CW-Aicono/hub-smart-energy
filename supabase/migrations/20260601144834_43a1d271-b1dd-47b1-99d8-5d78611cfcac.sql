-- Phantom-Sessions schließen: aktive Sessions, bei denen es eine spätere
-- completed-Session auf demselben CP+Connector gibt.
UPDATE public.charging_sessions a
SET
  stop_time = COALESCE(
    (SELECT b.start_time FROM public.charging_sessions b
       WHERE b.charge_point_id = a.charge_point_id
         AND b.connector_id = a.connector_id
         AND b.stop_time IS NOT NULL
         AND b.start_time > a.start_time
       ORDER BY b.start_time ASC LIMIT 1),
    now()
  ),
  status = 'orphaned',
  stop_reason = 'DuplicateStart'
WHERE a.stop_time IS NULL
  AND EXISTS (
    SELECT 1 FROM public.charging_sessions b
    WHERE b.charge_point_id = a.charge_point_id
      AND b.connector_id = a.connector_id
      AND b.stop_time IS NOT NULL
      AND b.start_time >= a.start_time
  );