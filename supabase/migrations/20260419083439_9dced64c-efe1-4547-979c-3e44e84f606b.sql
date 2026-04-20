-- 1. Add status to sales_quotes
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- Mark all existing quotes as finalized
UPDATE public.sales_quotes SET status = 'finalized' WHERE status = 'draft';

-- 2. Make measurement_point_id nullable on sales_recommended_devices
ALTER TABLE public.sales_recommended_devices
  ALTER COLUMN measurement_point_id DROP NOT NULL;

-- 3. Add distribution_id and scope
ALTER TABLE public.sales_recommended_devices
  ADD COLUMN IF NOT EXISTS distribution_id uuid REFERENCES public.sales_distributions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'measurement_point';

-- Backfill scope for existing rows
UPDATE public.sales_recommended_devices
  SET scope = 'measurement_point'
  WHERE scope IS NULL OR scope = '';

-- 4. Index for distribution queries
CREATE INDEX IF NOT EXISTS idx_sales_recommended_devices_distribution
  ON public.sales_recommended_devices(distribution_id)
  WHERE distribution_id IS NOT NULL;

-- 5. Constraint: either measurement_point_id or distribution_id must be set (or scope = project)
ALTER TABLE public.sales_recommended_devices
  DROP CONSTRAINT IF EXISTS sales_recommended_devices_scope_check;

ALTER TABLE public.sales_recommended_devices
  ADD CONSTRAINT sales_recommended_devices_scope_check
  CHECK (
    (scope = 'measurement_point' AND measurement_point_id IS NOT NULL)
    OR (scope = 'distribution' AND distribution_id IS NOT NULL)
    OR (scope = 'project')
  );