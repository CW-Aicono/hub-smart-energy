
INSERT INTO public.permissions (code, name, description, category)
VALUES ('board.access', 'C-Level-Dashboard öffnen', 'Berechtigt zum Zugriff auf das C-Level-Dashboard (board.aicono.org)', 'board')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.board_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  colors_light jsonb NOT NULL,
  colors_dark jsonb NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_themes TO authenticated;
GRANT ALL ON public.board_themes TO service_role;
ALTER TABLE public.board_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board themes readable" ON public.board_themes FOR SELECT TO authenticated
USING (
  is_system = true
  OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);
CREATE POLICY "Tenant admins manage own themes" ON public.board_themes FOR ALL TO authenticated
USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR (is_system = true AND public.has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR (is_system = true AND public.has_role(auth.uid(), 'super_admin'))
);

CREATE TABLE public.board_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  default_layout jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.board_templates TO authenticated;
GRANT ALL ON public.board_templates TO service_role;
ALTER TABLE public.board_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates readable by authenticated" ON public.board_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manages templates" ON public.board_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.board_user_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_code text NOT NULL DEFAULT 'ceo' REFERENCES public.board_templates(code),
  tiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme_id uuid REFERENCES public.board_themes(id) ON DELETE SET NULL,
  theme_mode text NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_user_layouts TO authenticated;
GRANT ALL ON public.board_user_layouts TO service_role;
ALTER TABLE public.board_user_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own layout" ON public.board_user_layouts FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "User writes own layout" ON public.board_user_layouts FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TRIGGER trg_board_themes_updated_at BEFORE UPDATE ON public.board_themes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_board_templates_updated_at BEFORE UPDATE ON public.board_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_board_user_layouts_updated_at BEFORE UPDATE ON public.board_user_layouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.board_themes (tenant_id, name, is_system, colors_light, colors_dark) VALUES
(NULL, 'Executive', true,
  '{"background":"220 20% 98%","card":"0 0% 100%","foreground":"220 25% 12%","muted":"220 15% 45%","accent":"199 89% 48%","success":"152 55% 42%","border":"220 15% 90%"}'::jsonb,
  '{"background":"222 25% 8%","card":"222 22% 12%","foreground":"220 15% 95%","muted":"220 10% 65%","accent":"199 89% 55%","success":"152 55% 50%","border":"222 18% 18%"}'::jsonb),
(NULL, 'Editorial', true,
  '{"background":"40 30% 97%","card":"0 0% 100%","foreground":"30 15% 15%","muted":"30 10% 45%","accent":"35 80% 50%","success":"152 50% 40%","border":"40 15% 88%"}'::jsonb,
  '{"background":"30 15% 10%","card":"30 12% 14%","foreground":"40 20% 92%","muted":"40 10% 65%","accent":"35 80% 58%","success":"152 50% 48%","border":"30 12% 20%"}'::jsonb),
(NULL, 'Boardroom', true,
  '{"background":"0 0% 96%","card":"0 0% 100%","foreground":"0 0% 12%","muted":"0 0% 45%","accent":"43 65% 49%","success":"152 60% 38%","border":"0 0% 88%"}'::jsonb,
  '{"background":"0 0% 7%","card":"0 0% 11%","foreground":"40 15% 92%","muted":"40 8% 65%","accent":"43 70% 55%","success":"152 60% 48%","border":"0 0% 18%"}'::jsonb);

INSERT INTO public.board_templates (code, name, description, default_layout, sort_order) VALUES
('ceo', 'CEO', 'Gesamtüberblick: Kosten, CO₂, Top/Flop-Standorte, Alerts, Forecast',
  '{"tiles":[{"id":"cost_month","size":"L"},{"id":"co2_month","size":"M"},{"id":"top_locations","size":"M"},{"id":"alerts_open","size":"S"},{"id":"forecast_eom","size":"M"},{"id":"savings_vs_last_year","size":"M"}]}'::jsonb, 1),
('cfo', 'CFO', 'Finanz-Sicht: Kosten, € pro Standort, Trading-P&L, offene Rechnungen',
  '{"tiles":[{"id":"cost_today","size":"M"},{"id":"cost_month","size":"L"},{"id":"cost_ytd","size":"M"},{"id":"savings_vs_last_year","size":"M"},{"id":"charging_revenue_month","size":"M"},{"id":"trading_pnl_month","size":"M"},{"id":"invoices_open","size":"S"}]}'::jsonb, 2),
('cto', 'CTO / COO', 'Technische Sicht: Verfügbarkeit, Autarkie, PV, Tasks, Stabilität',
  '{"tiles":[{"id":"gateway_availability","size":"L"},{"id":"self_sufficiency","size":"M"},{"id":"pv_yield_month","size":"M"},{"id":"tasks_open","size":"M"},{"id":"tasks_overdue","size":"S"},{"id":"cp_stability","size":"M"}]}'::jsonb, 3),
('esg', 'ESG', 'Nachhaltigkeit: CO₂, Autarkie, PV-Ertrag, vermiedene Tonnen',
  '{"tiles":[{"id":"co2_month","size":"L"},{"id":"co2_ytd","size":"M"},{"id":"self_consumption_ratio","size":"M"},{"id":"self_sufficiency","size":"M"},{"id":"pv_yield_month","size":"M"},{"id":"co2_avoided_tons","size":"M"}]}'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;
