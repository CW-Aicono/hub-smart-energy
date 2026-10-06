-- Idempotent: Heimat-Mandant von h.verst auf ESB GmbH setzen (Live zeigte Jüke).
UPDATE public.profiles p
SET tenant_id = t.id
FROM public.tenants t, auth.users u
WHERE t.slug = 'esb-gmbh'
  AND u.email = 'h.verst@esb-metelen.de'
  AND p.user_id = u.id
  AND p.tenant_id IS DISTINCT FROM t.id;