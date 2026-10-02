UPDATE public.tenants t
SET partner_id = sp.partner_org_id,
    support_owner = 'partner'
FROM public.sales_projects sp
WHERE sp.converted_tenant_id = t.id
  AND sp.partner_org_id IS NOT NULL
  AND t.partner_id IS NULL;