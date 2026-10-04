CREATE TABLE IF NOT EXISTS public.partner_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (partner_id, module_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_modules TO authenticated;
GRANT ALL ON public.partner_modules TO service_role;

ALTER TABLE public.partner_modules ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_modules'
      AND policyname = 'partner_modules_super_admin_all'
  ) THEN
    CREATE POLICY partner_modules_super_admin_all
      ON public.partner_modules
      TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
  END IF;
END
$policy$;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_modules'
      AND policyname = 'partner_modules_member_select'
  ) THEN
    CREATE POLICY partner_modules_member_select
      ON public.partner_modules
      FOR SELECT
      TO authenticated
      USING (public.is_partner_member(auth.uid(), partner_id));
  END IF;
END
$policy$;

INSERT INTO public.partner_modules (partner_id, module_code)
SELECT DISTINCT t.partner_id, tm.module_code
FROM public.tenant_modules AS tm
JOIN public.tenants AS t ON t.id = tm.tenant_id
WHERE t.partner_id IS NOT NULL
  AND tm.is_enabled = true
ON CONFLICT (partner_id, module_code) DO NOTHING;

INSERT INTO public.charger_models
  (vendor, model, protocol, power_kw, charging_type, is_active, notes)
VALUES
  ('Mennekes', 'AMTRON 4Business 760 (11/22 kW)', 'ocpp1.6', 22, 'AC', true,
   'Mennekes AMTRON 4Business 760; 11 oder 22 kW konfigurierbar, OCPP 1.6')
ON CONFLICT (vendor, model) DO UPDATE SET
  protocol = EXCLUDED.protocol,
  power_kw = EXCLUDED.power_kw,
  charging_type = EXCLUDED.charging_type,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = now();