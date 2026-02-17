
-- Fix OCPP log insert: Edge Functions nutzen service_role, daher kein auth.uid() vorhanden
-- WITH CHECK (true) für INSERT ist akzeptabel da nur über service_role (Backend) geschrieben wird
-- Wir beschränken es auf service_role durch Entfernen der Policy und Nutzung von RLS bypass
DROP POLICY IF EXISTS "System can insert OCPP logs" ON public.ocpp_message_log;

-- OCPP logs werden ausschließlich von Edge Functions via service_role geschrieben
-- service_role bypassed RLS automatisch - keine INSERT policy nötig
-- Nur SELECT für authentifizierte Mandanten-Nutzer
