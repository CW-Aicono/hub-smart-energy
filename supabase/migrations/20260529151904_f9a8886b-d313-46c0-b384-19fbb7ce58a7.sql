CREATE TABLE public.master_recovery_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  target_email text NOT NULL,
  success boolean NOT NULL,
  ip_address text,
  error_message text
);

CREATE INDEX idx_master_recovery_log_ip_created ON public.master_recovery_log (ip_address, created_at DESC);
CREATE INDEX idx_master_recovery_log_created ON public.master_recovery_log (created_at DESC);

GRANT SELECT ON public.master_recovery_log TO authenticated;
GRANT ALL ON public.master_recovery_log TO service_role;

ALTER TABLE public.master_recovery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only super_admins can read master recovery log"
ON public.master_recovery_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
