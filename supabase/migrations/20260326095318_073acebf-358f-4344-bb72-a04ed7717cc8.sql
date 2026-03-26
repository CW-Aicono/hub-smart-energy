-- Seed default integration categories for all tenants that don't have them yet
INSERT INTO public.integration_categories (tenant_id, name, slug, description, sort_order)
SELECT t.id, cat.name, cat.slug, cat.description, cat.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('Gateways', 'gateways', 'Gebäudeautomation und Smart-Home-Gateways', 1),
  ('Sonstige', 'sonstige', 'Weitere Integrationen', 99)
) AS cat(name, slug, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.integration_categories ic
  WHERE ic.tenant_id = t.id AND ic.slug = cat.slug
);