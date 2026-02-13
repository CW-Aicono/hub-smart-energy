
-- Change charging_sessions FK to SET NULL so sessions are preserved when charge point is deleted
ALTER TABLE public.charging_sessions 
  DROP CONSTRAINT charging_sessions_charge_point_id_fkey,
  ALTER COLUMN charge_point_id DROP NOT NULL,
  ADD CONSTRAINT charging_sessions_charge_point_id_fkey 
    FOREIGN KEY (charge_point_id) REFERENCES public.charge_points(id) ON DELETE SET NULL;
