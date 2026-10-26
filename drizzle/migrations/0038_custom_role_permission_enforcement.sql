CREATE OR REPLACE FUNCTION public.get_my_permission_codes()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- NULL = unrestricted (admin or no custom role assigned); array = only these codes
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) OR p.custom_role_id IS NULL THEN NULL
    ELSE coalesce((SELECT array_agg(pm.code) FROM public.custom_role_permissions crp
                   JOIN public.permissions pm ON pm.id = crp.permission_id
                   WHERE crp.custom_role_id = p.custom_role_id), ARRAY[]::text[])
  END
  FROM public.profiles p WHERE p.user_id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.get_my_permission_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_custom_permission(_user_id uuid, _code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND custom_role_id IS NOT NULL) THEN true
    ELSE EXISTS (SELECT 1 FROM public.profiles p
                 JOIN public.custom_role_permissions crp ON crp.custom_role_id = p.custom_role_id
                 JOIN public.permissions pm ON pm.id = crp.permission_id
                 WHERE p.user_id = _user_id AND pm.code = _code)
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_custom_permission(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Users can update own widgets" ON public.dashboard_widgets;
CREATE POLICY "Users can update own widgets" ON public.dashboard_widgets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_custom_permission(auth.uid(), 'dashboard.customize'));
DROP POLICY IF EXISTS "Users can delete own widgets" ON public.dashboard_widgets;
CREATE POLICY "Users can delete own widgets" ON public.dashboard_widgets FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.has_custom_permission(auth.uid(), 'dashboard.customize'));