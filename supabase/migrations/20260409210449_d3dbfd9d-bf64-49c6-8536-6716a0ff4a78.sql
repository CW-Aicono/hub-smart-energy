
CREATE TABLE public.charge_point_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id integer NOT NULL,
  status text NOT NULL DEFAULT 'available',
  connector_type text NOT NULL DEFAULT 'Type2',
  max_power_kw numeric NOT NULL DEFAULT 22,
  last_status_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (charge_point_id, connector_id)
);

ALTER TABLE public.charge_point_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read connectors"
  ON public.charge_point_connectors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage connectors"
  ON public.charge_point_connectors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_charge_point_connectors_updated_at
  BEFORE UPDATE ON public.charge_point_connectors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.charge_point_connectors;
