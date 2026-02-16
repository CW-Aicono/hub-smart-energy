
-- Add short OCPP-compliant app_tag to charging_users (max 20 chars, e.g. "APP12345678")
ALTER TABLE public.charging_users
ADD COLUMN app_tag text;

-- Create unique index per tenant for app_tag
CREATE UNIQUE INDEX idx_charging_users_app_tag_tenant 
ON public.charging_users (tenant_id, app_tag) 
WHERE app_tag IS NOT NULL;

-- Function to auto-generate a unique short app_tag on insert
CREATE OR REPLACE FUNCTION public.generate_app_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tag text;
  tag_exists boolean;
BEGIN
  -- Only generate if app_tag is not already set
  IF NEW.app_tag IS NULL THEN
    LOOP
      -- Generate "APP" + 8 random digits = 11 chars (well within OCPP 20-char limit)
      new_tag := 'APP' || lpad(floor(random() * 100000000)::text, 8, '0');
      -- Check uniqueness within tenant
      SELECT EXISTS (
        SELECT 1 FROM public.charging_users 
        WHERE tenant_id = NEW.tenant_id AND app_tag = new_tag
      ) INTO tag_exists;
      EXIT WHEN NOT tag_exists;
    END LOOP;
    NEW.app_tag := new_tag;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate app_tag on insert
CREATE TRIGGER trg_generate_app_tag
BEFORE INSERT ON public.charging_users
FOR EACH ROW
EXECUTE FUNCTION public.generate_app_tag();

-- Backfill existing rows with short app_tags
DO $$
DECLARE
  r RECORD;
  new_tag text;
  tag_exists boolean;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.charging_users WHERE app_tag IS NULL LOOP
    LOOP
      new_tag := 'APP' || lpad(floor(random() * 100000000)::text, 8, '0');
      SELECT EXISTS (
        SELECT 1 FROM public.charging_users 
        WHERE tenant_id = r.tenant_id AND app_tag = new_tag
      ) INTO tag_exists;
      EXIT WHEN NOT tag_exists;
    END LOOP;
    UPDATE public.charging_users SET app_tag = new_tag WHERE id = r.id;
  END LOOP;
END;
$$;
