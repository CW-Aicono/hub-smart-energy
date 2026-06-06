-- A2: Tenant Lifecycle (suspend / reactivate / soft-delete)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Validation via trigger (no CHECK constraint to keep mutability easy)
CREATE OR REPLACE FUNCTION public.validate_tenant_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('active','suspended','deleted') THEN
    RAISE EXCEPTION 'Invalid tenant.status: %', NEW.status;
  END IF;
  IF NEW.status = 'suspended' AND NEW.suspended_at IS NULL THEN
    NEW.suspended_at := now();
  END IF;
  IF NEW.status = 'deleted' AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;
  IF NEW.status = 'active' THEN
    NEW.suspended_at := NULL;
    NEW.suspended_reason := NULL;
    NEW.deleted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenant_status ON public.tenants;
CREATE TRIGGER trg_validate_tenant_status
BEFORE INSERT OR UPDATE OF status ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_status();

CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Helper to check tenant status (used by login guard via select)
CREATE OR REPLACE FUNCTION public.get_tenant_status(_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.tenants WHERE id = _tenant_id;
$$;