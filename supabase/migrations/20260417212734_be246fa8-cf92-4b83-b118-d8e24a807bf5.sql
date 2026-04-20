CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view system settings"
ON public.system_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can insert system settings"
ON public.system_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can update system settings"
ON public.system_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can delete system settings"
ON public.system_settings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_settings (key, value, description) VALUES
  ('worker_active', 'false', 'Wenn true und Heartbeat frisch (<5min): Edge Functions überspringen Schreibpfad, Worker ist primäre Datenquelle.'),
  ('worker_last_heartbeat', NULL, 'ISO-Timestamp des letzten Worker-Heartbeats. Wird vom Gateway-Worker via gateway-ingest gesetzt.')
ON CONFLICT (key) DO NOTHING;