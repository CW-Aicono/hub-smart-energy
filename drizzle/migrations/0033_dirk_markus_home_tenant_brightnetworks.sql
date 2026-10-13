UPDATE public.profiles p
SET tenant_id = t.id
FROM auth.users u, public.tenants t
WHERE u.id = p.user_id
  AND lower(u.email) = 'd.markus@bright-networks.de'
  AND t.slug = 'brightnetworks'
  AND p.tenant_id IS NULL;