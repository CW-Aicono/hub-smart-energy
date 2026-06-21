
-- A) Helper-Funktion: schließt alle noch offenen Vorgänger-Sessions einer Integration
CREATE OR REPLACE FUNCTION public.close_orphan_loxone_ws_sessions(
  _tenant_id uuid,
  _location_integration_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.loxone_ws_session_log
     SET ended_at = COALESCE(updated_at, now()),
         disconnect_reason = COALESCE(disconnect_reason, 'auto-closed-on-new-session')
   WHERE tenant_id = _tenant_id
     AND location_integration_id = _location_integration_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_orphan_loxone_ws_sessions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_orphan_loxone_ws_sessions(uuid, uuid) TO service_role;

-- C) Einmal-Reparatur: alle bestehenden Zombie-Zeilen schließen.
--    Pro Integration bleibt nur die NEUSTE Session offen (die ist die echte aktuelle).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, location_integration_id
           ORDER BY started_at DESC
         ) AS rn
    FROM public.loxone_ws_session_log
   WHERE ended_at IS NULL
)
UPDATE public.loxone_ws_session_log s
   SET ended_at = COALESCE(s.updated_at, s.started_at),
       disconnect_reason = COALESCE(s.disconnect_reason, 'historical-cleanup')
  FROM ranked r
 WHERE s.id = r.id
   AND r.rn > 1;
