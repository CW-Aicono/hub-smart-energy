CREATE TABLE public.email_send_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL,
  resend_message_id text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_email_send_audit_created_at ON public.email_send_audit (created_at DESC);
CREATE INDEX idx_email_send_audit_recipient ON public.email_send_audit (recipient);
CREATE INDEX idx_email_send_audit_type ON public.email_send_audit (type);

ALTER TABLE public.email_send_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin can read email_send_audit"
ON public.email_send_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));