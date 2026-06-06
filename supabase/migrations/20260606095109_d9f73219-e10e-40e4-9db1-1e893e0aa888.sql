
-- X4: monitoring_alert_rules
CREATE TABLE public.monitoring_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_category text NOT NULL,
  metric_name text NOT NULL,
  comparator text NOT NULL CHECK (comparator IN ('>','>=','<','<=')),
  threshold numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')) DEFAULT 'warning',
  enabled boolean NOT NULL DEFAULT true,
  notify_email text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_category, metric_name, comparator)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_alert_rules TO authenticated;
GRANT ALL ON public.monitoring_alert_rules TO service_role;

ALTER TABLE public.monitoring_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read alert rules"
  ON public.monitoring_alert_rules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert alert rules"
  ON public.monitoring_alert_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update alert rules"
  ON public.monitoring_alert_rules FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete alert rules"
  ON public.monitoring_alert_rules FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_monitoring_alert_rules_updated_at
  BEFORE UPDATE ON public.monitoring_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- X5: platform_metrics (historical)
CREATE TABLE public.platform_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  dimension text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_metrics_key_time
  ON public.platform_metrics (metric_key, recorded_at DESC);

GRANT SELECT, INSERT ON public.platform_metrics TO authenticated;
GRANT ALL ON public.platform_metrics TO service_role;

ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read platform metrics"
  ON public.platform_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert platform metrics"
  ON public.platform_metrics FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
