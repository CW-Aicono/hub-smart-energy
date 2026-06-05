
-- Erweitere virtual_meter_sources um Ladepunkt-Quellen

-- 1) source_meter_id nullable machen
ALTER TABLE public.virtual_meter_sources
  ALTER COLUMN source_meter_id DROP NOT NULL;

-- 2) Alte UNIQUE-Constraint entfernen (greift nicht mehr sauber, NULLs verhindern Duplikate-Schutz)
ALTER TABLE public.virtual_meter_sources
  DROP CONSTRAINT IF EXISTS virtual_meter_sources_virtual_meter_id_source_meter_id_key;

-- 3) Neue Quell-Spalten
ALTER TABLE public.virtual_meter_sources
  ADD COLUMN IF NOT EXISTS source_charge_point_id uuid
    REFERENCES public.charge_points(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_charge_point_group_id uuid
    REFERENCES public.charge_point_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_all_charge_points boolean NOT NULL DEFAULT false;

-- 4) CHECK: genau eine Quelle pro Zeile
ALTER TABLE public.virtual_meter_sources
  DROP CONSTRAINT IF EXISTS virtual_meter_sources_exactly_one_source;
ALTER TABLE public.virtual_meter_sources
  ADD CONSTRAINT virtual_meter_sources_exactly_one_source CHECK (
    (
      (source_meter_id IS NOT NULL)::int
      + (source_charge_point_id IS NOT NULL)::int
      + (source_charge_point_group_id IS NOT NULL)::int
      + (source_all_charge_points)::int
    ) = 1
  );

-- 5) Partielle Unique-Indizes je Quelltyp (verhindert Duplikate innerhalb eines virtuellen Zählers)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vms_meter
  ON public.virtual_meter_sources (virtual_meter_id, source_meter_id)
  WHERE source_meter_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vms_cp
  ON public.virtual_meter_sources (virtual_meter_id, source_charge_point_id)
  WHERE source_charge_point_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vms_cpg
  ON public.virtual_meter_sources (virtual_meter_id, source_charge_point_group_id)
  WHERE source_charge_point_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vms_all
  ON public.virtual_meter_sources (virtual_meter_id)
  WHERE source_all_charge_points = true;
