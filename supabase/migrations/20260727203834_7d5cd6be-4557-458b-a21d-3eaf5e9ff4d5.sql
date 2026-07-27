DROP POLICY IF EXISTS "Super admins can view all integrations" ON public.integrations;
CREATE POLICY "Super admins can view all integrations"
  ON public.integrations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

UPDATE public.bridge_miniserver_links l
SET location_id = li.location_id
FROM public.location_integrations li
JOIN public.integrations i ON i.id = li.integration_id
WHERE i.type IN ('loxone', 'loxone_miniserver')
  AND upper(trim(li.config->>'serial_number')) = l.miniserver_serial
  AND l.location_id IS NULL;

DO $$
DECLARE
  v_worker_id UUID;
  v_tenant_id UUID;
  v_location_id UUID;
BEGIN
  SELECT id INTO v_worker_id
  FROM public.bridge_workers
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT l.tenant_id, l.id
    INTO v_tenant_id, v_location_id
  FROM public.location_integrations li
  JOIN public.integrations i ON i.id = li.integration_id
  JOIN public.locations l ON l.id = li.location_id
  WHERE i.type IN ('loxone', 'loxone_miniserver')
    AND upper(trim(li.config->>'serial_number')) = '504F94A24035'
  LIMIT 1;

  IF v_worker_id IS NOT NULL AND v_tenant_id IS NOT NULL THEN
    INSERT INTO public.bridge_miniserver_links
      (worker_id, tenant_id, location_id, miniserver_serial, miniserver_generation, connection_kind, enabled, notes)
    VALUES
      (v_worker_id, v_tenant_id, v_location_id, '504F94A24035', 2, 'remote_connect', true, 'ESBGmbH – Loxone Testkoffer')
    ON CONFLICT (worker_id, miniserver_serial) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          location_id = EXCLUDED.location_id;
  END IF;
END $$;