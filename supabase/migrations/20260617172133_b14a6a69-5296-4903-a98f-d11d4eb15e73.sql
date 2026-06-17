
-- =====================================================================
-- Schritt 2: Loxone Daily Totals Repair
-- =====================================================================

-- 0) Backup-Tabelle (für Rollback)
CREATE TABLE IF NOT EXISTS public.meter_period_totals_loxone_repair_backup_20260617 (
  backup_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_action text NOT NULL,
  backup_at timestamptz NOT NULL DEFAULT now(),
  id uuid,
  tenant_id uuid,
  meter_id uuid,
  period_type text,
  period_start date,
  total_value numeric,
  energy_type text,
  source text,
  created_at timestamptz,
  updated_at timestamptz
);

GRANT SELECT ON public.meter_period_totals_loxone_repair_backup_20260617 TO authenticated;
GRANT ALL ON public.meter_period_totals_loxone_repair_backup_20260617 TO service_role;
ALTER TABLE public.meter_period_totals_loxone_repair_backup_20260617 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super admins read repair backup" ON public.meter_period_totals_loxone_repair_backup_20260617;
CREATE POLICY "super admins read repair backup" ON public.meter_period_totals_loxone_repair_backup_20260617
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 1) Klassifikation in temporärer Tabelle
DROP TABLE IF EXISTS _loxone_repair_plan;
CREATE TEMP TABLE _loxone_repair_plan AS
WITH loxone AS (
  SELECT id, tenant_id, meter_id, period_start, total_value, source, energy_type
  FROM public.meter_period_totals
  WHERE period_type='day' AND source IN ('loxone','loxone_backfill')
),
five_min AS (
  SELECT meter_id,
         (bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
         SUM(power_avg * COALESCE(resolution_minutes,5)/60.0) AS kwh
  FROM public.meter_power_readings_5min
  WHERE meter_id IN (SELECT DISTINCT meter_id FROM loxone)
  GROUP BY meter_id, (bucket AT TIME ZONE 'Europe/Berlin')::date
),
joined AS (
  SELECT l.id, l.tenant_id, l.meter_id, l.period_start, l.total_value, l.source, l.energy_type,
         fm_same.kwh AS kwh_same,
         fm_prev.kwh AS kwh_prev
  FROM loxone l
  LEFT JOIN five_min fm_same ON fm_same.meter_id=l.meter_id AND fm_same.day=l.period_start
  LEFT JOIN five_min fm_prev ON fm_prev.meter_id=l.meter_id AND fm_prev.day=l.period_start - 1
),
off_by_one AS (
  SELECT id, meter_id, energy_type, period_start, total_value,
         'off_by_one'::text AS action,
         (period_start - 1) AS target_day
  FROM joined
  WHERE kwh_prev IS NOT NULL AND kwh_prev > 0
    AND ABS(total_value - kwh_prev)/kwh_prev <= 0.05
    AND (kwh_same IS NULL OR kwh_same = 0 OR ABS(total_value - kwh_same)/kwh_same > 0.05)
),
loxone_with_neighbors AS (
  SELECT l.id, l.meter_id, l.energy_type, l.period_start, l.total_value,
    LAG(l.total_value) OVER w AS prev_val,
    LAG(l.period_start) OVER w AS prev_day,
    LAG(l.id) OVER w AS prev_id,
    LEAD(l.total_value) OVER w AS next_val,
    LEAD(l.period_start) OVER w AS next_day,
    LEAD(l.id) OVER w AS next_id
  FROM loxone l
  WINDOW w AS (PARTITION BY l.meter_id, l.energy_type ORDER BY l.period_start)
),
dup_to_delete AS (
  -- consecutive identical pair: delete the row whose period_start does NOT match 5-min profile.
  -- Default: delete the later (current) row if its kwh_same doesn't match.
  SELECT w.id, w.meter_id, w.energy_type, w.period_start, w.total_value,
         'duplicate_with_prev'::text AS action,
         NULL::date AS target_day
  FROM loxone_with_neighbors w
  LEFT JOIN five_min fm ON fm.meter_id=w.meter_id AND fm.day=w.period_start
  WHERE w.prev_val IS NOT NULL
    AND w.prev_val = w.total_value
    AND w.prev_day = w.period_start - 1
    AND (fm.kwh IS NULL OR fm.kwh = 0 OR ABS(w.total_value - fm.kwh)/fm.kwh > 0.05)
    -- Don't double-process off_by_one rows
    AND w.id NOT IN (SELECT id FROM off_by_one)
)
SELECT * FROM off_by_one
UNION ALL
SELECT * FROM dup_to_delete;

-- 2) Backup ALLE betroffenen Original-Zeilen
INSERT INTO public.meter_period_totals_loxone_repair_backup_20260617
  (backup_action, id, tenant_id, meter_id, period_type, period_start, total_value, energy_type, source, created_at, updated_at)
SELECT p.action || '_source_row', m.id, m.tenant_id, m.meter_id, m.period_type, m.period_start, m.total_value, m.energy_type, m.source, m.created_at, m.updated_at
FROM _loxone_repair_plan p
JOIN public.meter_period_totals m ON m.id = p.id;

-- 3) Backup KOLLISIONS-Zeilen am Zieltag (werden gelöscht, um Unique-Konflikt zu vermeiden)
INSERT INTO public.meter_period_totals_loxone_repair_backup_20260617
  (backup_action, id, tenant_id, meter_id, period_type, period_start, total_value, energy_type, source, created_at, updated_at)
SELECT 'off_by_one_collision_deleted', m.id, m.tenant_id, m.meter_id, m.period_type, m.period_start, m.total_value, m.energy_type, m.source, m.created_at, m.updated_at
FROM _loxone_repair_plan p
JOIN public.meter_period_totals m
  ON m.meter_id = p.meter_id
 AND m.period_type = 'day'
 AND m.period_start = p.target_day
WHERE p.action = 'off_by_one'
  AND m.id <> p.id;

-- 4) Lösche Kollisions-Zeilen
DELETE FROM public.meter_period_totals m
USING _loxone_repair_plan p
WHERE p.action = 'off_by_one'
  AND m.meter_id = p.meter_id
  AND m.period_type = 'day'
  AND m.period_start = p.target_day
  AND m.id <> p.id;

-- 5) Lösche Duplikat-Zeilen
DELETE FROM public.meter_period_totals m
USING _loxone_repair_plan p
WHERE p.action = 'duplicate_with_prev'
  AND m.id = p.id;

-- 6) Verschiebe off_by_one-Zeilen um -1 Tag, markiere Quelle
UPDATE public.meter_period_totals m
SET period_start = p.target_day,
    source = 'loxone_repaired_off_by_one',
    updated_at = now()
FROM _loxone_repair_plan p
WHERE p.action = 'off_by_one'
  AND m.id = p.id;

-- 7) Summary in NOTICE
DO $$
DECLARE
  off_by_one_count int;
  dup_count int;
  collision_count int;
BEGIN
  SELECT COUNT(*) INTO off_by_one_count FROM public.meter_period_totals_loxone_repair_backup_20260617 WHERE backup_action='off_by_one_source_row';
  SELECT COUNT(*) INTO dup_count FROM public.meter_period_totals_loxone_repair_backup_20260617 WHERE backup_action='duplicate_with_prev_source_row';
  SELECT COUNT(*) INTO collision_count FROM public.meter_period_totals_loxone_repair_backup_20260617 WHERE backup_action='off_by_one_collision_deleted';
  RAISE NOTICE 'Loxone Repair Summary: off_by_one_fixed=%, duplicates_deleted=%, collisions_deleted=%', off_by_one_count, dup_count, collision_count;
END $$;
