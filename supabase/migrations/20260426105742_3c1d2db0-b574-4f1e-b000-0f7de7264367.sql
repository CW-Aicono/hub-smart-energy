DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '136dac7d-f1d3-4000-bd6b-65a33c7dd29b') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES ('136dac7d-f1d3-4000-bd6b-65a33c7dd29b', 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
