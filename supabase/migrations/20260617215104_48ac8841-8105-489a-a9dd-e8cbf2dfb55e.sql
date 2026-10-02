CREATE TABLE IF NOT EXISTS public.copilot_prompt_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text NOT NULL,
  prompt text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_prompt_presets_tenant ON public.copilot_prompt_presets(tenant_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_prompt_presets TO authenticated;
GRANT ALL ON public.copilot_prompt_presets TO service_role;

ALTER TABLE public.copilot_prompt_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prompt presets in their tenant"
  ON public.copilot_prompt_presets FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert prompt presets in their tenant"
  ON public.copilot_prompt_presets FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update prompt presets in their tenant"
  ON public.copilot_prompt_presets FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete prompt presets in their tenant"
  ON public.copilot_prompt_presets FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER trg_copilot_prompt_presets_updated_at
  BEFORE UPDATE ON public.copilot_prompt_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.copilot_prompt_presets (tenant_id, label, prompt, sort_order, is_default)
SELECT t.id, x.label, x.prompt, x.sort_order, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('Top-Stromverbraucher (Standorte)', 'Welche 3 Standorte haben im ausgewählten Zeitraum den höchsten Stromverbrauch in kWh? Vergleiche sie in einem Balkendiagramm.', 10),
  ('Tägliche Grundlast', 'Wie hat sich die Grundlast (nächtlicher Minimalverbrauch zwischen 00:00 und 05:00 Uhr) im ausgewählten Zeitraum pro Tag entwickelt? Nutze ausschließlich daily_base_load_kw.', 20),
  ('PV-Eigenverbrauchsquote', 'Berechne die PV-Eigenverbrauchsquote pro Standort im ausgewählten Zeitraum und vergleiche sie.', 30),
  ('Wallbox-Auslastung', 'Wie war die Wallbox-Auslastung (kWh und Anzahl Sessions >= 0,1 kWh) pro Ladepunkt im ausgewählten Zeitraum?', 40),
  ('Top 5 Lastspitzen', 'Welche 5 Tage hatten die höchsten Lastspitzen (nur Hauptzähler Strom-Bezug) im ausgewählten Zeitraum? Liste Datum und Spitzenwert in kW.', 50),
  ('Verbrauchsanomalien', 'Identifiziere Tage mit ungewöhnlich hohem oder niedrigem Stromverbrauch (Hauptzähler) im ausgewählten Zeitraum.', 60),
  ('PV-Ertrag pro Standort', 'Wie hoch war der PV-Ertrag pro Standort im ausgewählten Zeitraum in kWh?', 70),
  ('Verbrauch pro Wochentag', 'Wie verteilt sich der Stromverbrauch (Hauptzähler) über die Wochentage (Mo–So) im ausgewählten Zeitraum? Nutze weekday_consumption_kwh.', 80)
) AS x(label, prompt, sort_order)
ON CONFLICT DO NOTHING;