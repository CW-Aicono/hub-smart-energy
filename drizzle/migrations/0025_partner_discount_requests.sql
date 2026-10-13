CREATE TABLE IF NOT EXISTS public.partner_discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_codes text[] NOT NULL,
  approved_module_codes text[],
  discount_type text NOT NULL CHECK (discount_type IN ('percent','absolute')),
  value numeric NOT NULL CHECK (value > 0),
  valid_from date NOT NULL,
  duration_months integer CHECK (duration_months IS NULL OR (duration_months BETWEEN 1 AND 120)),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decision_note text,
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(module_codes,1) >= 1),
  CHECK (discount_type <> 'percent' OR value <= 100)
);
CREATE INDEX IF NOT EXISTS partner_discount_requests_partner_idx ON public.partner_discount_requests(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_discount_requests_status_idx ON public.partner_discount_requests(status) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.partner_discount_requests TO authenticated;
GRANT ALL ON public.partner_discount_requests TO service_role;
ALTER TABLE public.partner_discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdr partner read" ON public.partner_discount_requests;
CREATE POLICY "pdr partner read" ON public.partner_discount_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.user_id = auth.uid() AND pm.partner_id = partner_discount_requests.partner_id));

DROP POLICY IF EXISTS "pdr portal read" ON public.partner_discount_requests;
CREATE POLICY "pdr portal read" ON public.partner_discount_requests FOR SELECT TO authenticated
  USING (public.can_portal_read(auth.uid(), 'commercial'));

DROP POLICY IF EXISTS "pdr partner admin insert" ON public.partner_discount_requests;
CREATE POLICY "pdr partner admin insert" ON public.partner_discount_requests FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending' AND requested_by = auth.uid() AND decided_by IS NULL AND approved_module_codes IS NULL
    AND EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.user_id = auth.uid() AND pm.partner_id = partner_discount_requests.partner_id AND pm.partner_role = 'partner_admin')
    AND (tenant_id IS NULL OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = partner_discount_requests.tenant_id AND t.partner_id = partner_discount_requests.partner_id))
  );

DROP POLICY IF EXISTS "pdr partner admin cancel" ON public.partner_discount_requests;
CREATE POLICY "pdr partner admin cancel" ON public.partner_discount_requests FOR UPDATE TO authenticated
  USING (status = 'pending' AND EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.user_id = auth.uid() AND pm.partner_id = partner_discount_requests.partner_id AND pm.partner_role = 'partner_admin'))
  WITH CHECK (status = 'cancelled' AND decided_by IS NULL AND approved_module_codes IS NULL);