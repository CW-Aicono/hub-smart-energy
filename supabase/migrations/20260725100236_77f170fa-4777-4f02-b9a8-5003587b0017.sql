
ALTER TABLE public.monitoring_alert_events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mae_archived ON public.monitoring_alert_events (archived_at);

GRANT UPDATE, DELETE ON public.monitoring_alert_events TO authenticated;

DROP POLICY IF EXISTS "Super admins can update alert events" ON public.monitoring_alert_events;
CREATE POLICY "Super admins can update alert events"
  ON public.monitoring_alert_events FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can delete alert events" ON public.monitoring_alert_events;
CREATE POLICY "Super admins can delete alert events"
  ON public.monitoring_alert_events FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
