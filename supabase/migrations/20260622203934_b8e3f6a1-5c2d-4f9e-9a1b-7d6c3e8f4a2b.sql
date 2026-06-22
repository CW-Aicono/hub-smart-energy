-- =============================================
-- Backfill: automation.* Permissions (Drift-Fix)
-- =============================================
-- In staging wurden ueber den Studio-SQL-Editor direkt 5 neue, feingranulare
-- automation.*-Permissions angelegt (vermutlich als Ablösung/Ergänzung von
-- automation.manage), nie als Migration. Dadurch waren sie in Prod nie
-- vorhanden, egal wie oft "Go-Live" gedrueckt wurde (siehe
-- docs/DEPLOYMENT.md, Abschnitt "DB-Aenderungen: nur per Migration").
-- Per scripts/check-cron-drift.sh-Schwester-Check (Permissions-Variante)
-- gefunden: 2026-06-22.

INSERT INTO public.permissions (code, name, category) VALUES
  ('automation.view', 'Automationen anzeigen', 'automation'),
  ('automation.create', 'Automationen erstellen', 'automation'),
  ('automation.edit', 'Automationen bearbeiten', 'automation'),
  ('automation.delete', 'Automationen löschen', 'automation'),
  ('automation.execute', 'Automationen ausführen', 'automation')
ON CONFLICT (code) DO NOTHING;

-- Gleiches Muster wie bei der letzten "Add missing permissions"-Migration:
-- neue Permissions automatisch der admin-Rolle zuweisen.
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, p.id
FROM public.permissions p
WHERE p.code IN (
  'automation.view', 'automation.create', 'automation.edit',
  'automation.delete', 'automation.execute'
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = 'admin'::public.app_role AND rp.permission_id = p.id
);
