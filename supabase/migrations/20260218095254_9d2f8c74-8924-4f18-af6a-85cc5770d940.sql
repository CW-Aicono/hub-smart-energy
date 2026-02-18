-- 1. Re-create the trigger that creates a profile for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Fix missing profile for the already-created user paul@krasspluswissing.de
INSERT INTO public.profiles (user_id, email, tenant_id, contact_person)
VALUES (
  '2dfb7779-9f4d-4d29-a336-a4afe8137de9',
  'paul@krasspluswissing.de',
  '0ce0c43a-c0b4-417b-9fd5-4131907e7504',  -- tenant of Demo Organisation (Krass & Wissing GmbH)
  'Paul Krass'
)
ON CONFLICT (user_id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      contact_person = EXCLUDED.contact_person;

-- Also ensure role exists
INSERT INTO public.user_roles (user_id, role)
VALUES ('2dfb7779-9f4d-4d29-a336-a4afe8137de9', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;