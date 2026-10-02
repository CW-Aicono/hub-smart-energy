
-- 1. sales_locations
CREATE TABLE public.sales_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.sales_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  adresse text,
  usage_type text,
  net_floor_area numeric,
  construction_year integer,
  renovation_year integer,
  heating_type text,
  federal_state text,
  grid_limit_kw numeric,
  hot_water_energy_type text,
  is_main boolean NOT NULL DEFAULT false,
  notizen text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_locations TO authenticated;
GRANT ALL ON public.sales_locations TO service_role;
ALTER TABLE public.sales_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_locations project access" ON public.sales_locations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_projects p WHERE p.id = project_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_projects p WHERE p.id = project_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ));

-- 2. sales_location_energy_sources
CREATE TABLE public.sales_location_energy_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_location_id uuid NOT NULL REFERENCES public.sales_locations(id) ON DELETE CASCADE,
  energy_type text NOT NULL,
  custom_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_location_energy_sources TO authenticated;
GRANT ALL ON public.sales_location_energy_sources TO service_role;
ALTER TABLE public.sales_location_energy_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_location_energy_sources access" ON public.sales_location_energy_sources
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_locations sl
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sl.id = sales_location_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_locations sl
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sl.id = sales_location_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ));

-- 3. sales_floors
CREATE TABLE public.sales_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_location_id uuid NOT NULL REFERENCES public.sales_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_number integer NOT NULL DEFAULT 0,
  area_sqm numeric,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_floors TO authenticated;
GRANT ALL ON public.sales_floors TO service_role;
ALTER TABLE public.sales_floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_floors access" ON public.sales_floors
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_locations sl
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sl.id = sales_location_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_locations sl
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sl.id = sales_location_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ));

-- 4. sales_rooms
CREATE TABLE public.sales_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_floor_id uuid NOT NULL REFERENCES public.sales_floors(id) ON DELETE CASCADE,
  name text NOT NULL,
  width numeric,
  depth numeric,
  wall_height numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_rooms TO authenticated;
GRANT ALL ON public.sales_rooms TO service_role;
ALTER TABLE public.sales_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_rooms access" ON public.sales_rooms
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_floors sf
    JOIN public.sales_locations sl ON sl.id = sf.sales_location_id
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sf.id = sales_floor_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_floors sf
    JOIN public.sales_locations sl ON sl.id = sf.sales_location_id
    JOIN public.sales_projects p ON p.id = sl.project_id
    WHERE sf.id = sales_floor_id
      AND (p.partner_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin')
           OR EXISTS (SELECT 1 FROM public.partner_members pm
                      WHERE pm.partner_id = p.partner_org_id AND pm.user_id = auth.uid()))
  ));

-- updated_at triggers (reuse existing helper)
CREATE TRIGGER trg_sales_locations_updated
  BEFORE UPDATE ON public.sales_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sales_floors_updated
  BEFORE UPDATE ON public.sales_floors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sales_rooms_updated
  BEFORE UPDATE ON public.sales_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sales_locations_project ON public.sales_locations(project_id);
CREATE INDEX idx_sales_floors_location ON public.sales_floors(sales_location_id);
CREATE INDEX idx_sales_rooms_floor ON public.sales_rooms(sales_floor_id);
CREATE INDEX idx_sales_les_location ON public.sales_location_energy_sources(sales_location_id);
