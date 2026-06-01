-- Stufe 5: Sales Scout im Partner-Kontext

-- 1) Partner-Org-Referenz auf sales_projects
ALTER TABLE public.sales_projects
  ADD COLUMN IF NOT EXISTS partner_org_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_projects_partner_org
  ON public.sales_projects(partner_org_id);

-- 2) Bestehende Projekte: falls bisheriger partner_id (auth.uid()) ein partner_member ist, übernehmen
UPDATE public.sales_projects sp
SET partner_org_id = pm.partner_id
FROM public.partner_members pm
WHERE pm.user_id = sp.partner_id
  AND sp.partner_org_id IS NULL;

-- 3) RLS: sales_projects neue Policies mit Partner-Org-Zweig
DROP POLICY IF EXISTS "Partner manages own projects" ON public.sales_projects;
DROP POLICY IF EXISTS "Partner sees own projects" ON public.sales_projects;

CREATE POLICY "Sales projects select"
ON public.sales_projects FOR SELECT TO authenticated
USING (
  partner_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (partner_org_id IS NOT NULL AND public.is_partner_member(auth.uid(), partner_org_id))
);

CREATE POLICY "Sales projects write"
ON public.sales_projects FOR ALL TO authenticated
USING (
  partner_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (partner_org_id IS NOT NULL AND public.is_partner_member(auth.uid(), partner_org_id))
)
WITH CHECK (
  partner_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (partner_org_id IS NOT NULL AND public.is_partner_member(auth.uid(), partner_org_id))
);

-- 4) Helper für Kindtabellen
CREATE OR REPLACE FUNCTION public.can_access_sales_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_projects p
    WHERE p.id = _project_id
      AND (
        p.partner_id = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR (p.partner_org_id IS NOT NULL AND public.is_partner_member(auth.uid(), p.partner_org_id))
      )
  )
$$;

-- 5) sales_quotes Policy ersetzen
DROP POLICY IF EXISTS "Access via project" ON public.sales_quotes;
CREATE POLICY "Access via project"
ON public.sales_quotes FOR ALL TO authenticated
USING (public.can_access_sales_project(project_id))
WITH CHECK (public.can_access_sales_project(project_id));

-- 6) sales_distributions Policy ersetzen
DROP POLICY IF EXISTS "Access via project" ON public.sales_distributions;
CREATE POLICY "Access via project"
ON public.sales_distributions FOR ALL TO authenticated
USING (public.can_access_sales_project(project_id))
WITH CHECK (public.can_access_sales_project(project_id));

-- 7) sales_quote_events Policy ersetzen
DROP POLICY IF EXISTS "Partner can view own quote events" ON public.sales_quote_events;
CREATE POLICY "Partner can view own quote events"
ON public.sales_quote_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sales_quotes q
  WHERE q.id = sales_quote_events.quote_id
    AND public.can_access_sales_project(q.project_id)
));

-- 8) sales_project_attachments Policies ersetzen (eigene partner_id-Spalte ignorieren wir
-- für Lesezugriff zugunsten Projektzugriff; Insert/Update/Delete bleibt auf eigenen Owner beschränkt
-- ODER über Projekt-Zugang)
DROP POLICY IF EXISTS "Partner can view own project attachments" ON public.sales_project_attachments;
DROP POLICY IF EXISTS "Partner can insert attachments to own projects" ON public.sales_project_attachments;
DROP POLICY IF EXISTS "Partner can update own project attachments" ON public.sales_project_attachments;
DROP POLICY IF EXISTS "Partner can delete own project attachments" ON public.sales_project_attachments;

CREATE POLICY "Attachments select via project"
ON public.sales_project_attachments FOR SELECT TO authenticated
USING (public.can_access_sales_project(project_id));

CREATE POLICY "Attachments insert via project"
ON public.sales_project_attachments FOR INSERT TO authenticated
WITH CHECK (public.can_access_sales_project(project_id));

CREATE POLICY "Attachments update via project"
ON public.sales_project_attachments FOR UPDATE TO authenticated
USING (public.can_access_sales_project(project_id))
WITH CHECK (public.can_access_sales_project(project_id));

CREATE POLICY "Attachments delete via project"
ON public.sales_project_attachments FOR DELETE TO authenticated
USING (public.can_access_sales_project(project_id));