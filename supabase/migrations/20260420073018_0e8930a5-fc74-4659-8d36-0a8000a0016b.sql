-- Replace old unique (tenant_id, device_name) with non-unique index (typed comparison)
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'gateway_devices'
      AND ix.indisunique = true
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['tenant_id','device_name']::text[]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.index_name);
  END LOOP;
END$$;

ALTER TABLE public.gateway_devices
  DROP CONSTRAINT IF EXISTS gateway_devices_tenant_id_device_name_key;

CREATE INDEX IF NOT EXISTS gateway_devices_tenant_device_name_idx
  ON public.gateway_devices (tenant_id, device_name);

-- Allow tenant_id to be NULL (pending assignment)
ALTER TABLE public.gateway_devices
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Status check (extend allowed values to include pending_assignment)
ALTER TABLE public.gateway_devices
  DROP CONSTRAINT IF EXISTS gateway_devices_status_check;
ALTER TABLE public.gateway_devices
  ADD CONSTRAINT gateway_devices_status_check
  CHECK (status IN ('online', 'offline', 'syncing', 'error', 'pending_assignment'));