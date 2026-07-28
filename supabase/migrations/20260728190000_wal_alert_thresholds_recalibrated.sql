-- =========================================================================
-- WAL-Alarmschwellen neu kalibrieren
--
-- Hintergrund: Der WAL-Saegezahn auf prod kam nicht von der Schreiblast,
-- sondern von einem haengenden logischen Replication Slot. Logflare
-- (supabase-analytics) oeffnet ueber Logflare.PgPublisher einen temporaeren
-- Slot auf DB `_supabase` (Publication `logflare_pub`) und bestaetigt ihn nie
-- -- `confirmed_flush_lsn` bleibt auf der Erzeugungsposition stehen. Logische
-- Slots halten WAL clusterweit fest, der Slot staut also auch den WAL der
-- Sensor-Writes in DB `postgres` auf.
--
-- Gegenmassnahme in docker-compose.yml: max_slot_wal_keep_size=1024MB.
-- Damit liegt der erwartete pg_wal-Peak bei rund 2,4 GB (ca. 1,3 GB recycelte
-- Segmente im Normalbetrieb + 1 GB Slot-Rueckstau bis zur Invalidierung).
--
-- Die alten Schwellen (1 GB warning / 2 GB critical) liegen unterhalb dieses
-- normalen Bereichs und wuerden dauerhaft feuern. Neue Schwellen:
--   warning  2,5 GB -> der Deckel greift nicht wie erwartet
--   critical 3,5 GB -> echter Rueckstau jenseits des Deckels
--
-- UPDATE statt reinem INSERT, weil die Regel auf prod direkt in der DB
-- veraendert wurde (dort stand 4 GiB critical) und daher von einem
-- ON CONFLICT DO NOTHING nicht erfasst wuerde.
-- =========================================================================

INSERT INTO public.monitoring_alert_rules
  (metric_category, metric_name, comparator, threshold, severity, enabled)
VALUES
  ('wal', 'current_size_bytes', '>',  2684354560, 'warning',  true),  -- 2,5 GB
  ('wal', 'current_size_bytes', '>=', 3758096384, 'critical', true)   -- 3,5 GB
ON CONFLICT (metric_category, metric_name, comparator) DO UPDATE
  SET threshold = EXCLUDED.threshold,
      severity  = EXCLUDED.severity,
      enabled   = EXCLUDED.enabled;
