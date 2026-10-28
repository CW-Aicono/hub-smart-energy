-- Komplex-Etagen in umbenennbare Platzhalter-Gebäude; flexible Umbau-Funktionen
CREATE OR REPLACE FUNCTION public._can_restructure_location(p_loc uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.locations WHERE id = p_loc;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Standort nicht gefunden'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') AND public.get_user_tenant_id() = v_tenant) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  RETURN v_tenant;
END $$;

CREATE OR REPLACE FUNCTION public._complex_of(p_loc uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN l.type = 'gebaeudekomplex' THEN l.id ELSE l.parent_id END FROM public.locations l WHERE l.id = p_loc
$$;

CREATE OR REPLACE FUNCTION public._move_floor_to(p_floor uuid, p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.floors SET location_id = p_target, updated_at = now() WHERE id = p_floor;
  UPDATE public.meters SET location_id = p_target WHERE floor_id = p_floor;
END $$;

-- Etage verschieben (innerhalb desselben Komplexes)
CREATE OR REPLACE FUNCTION public.move_floor_to_building(p_floor_id uuid, p_target_location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src uuid; v_t1 uuid; v_t2 uuid;
BEGIN
  SELECT location_id INTO v_src FROM public.floors WHERE id = p_floor_id;
  IF v_src IS NULL THEN RAISE EXCEPTION 'Etage nicht gefunden'; END IF;
  v_t1 := public._can_restructure_location(v_src);
  v_t2 := public._can_restructure_location(p_target_location_id);
  IF v_t1 <> v_t2 OR public._complex_of(v_src) IS DISTINCT FROM public._complex_of(p_target_location_id) OR public._complex_of(v_src) IS NULL THEN
    RAISE EXCEPTION 'Ziel muss im selben Gebäudekomplex liegen';
  END IF;
  PERFORM public._move_floor_to(p_floor_id, p_target_location_id);
END $$;

-- Etage in Gebäude umwandeln: neues Gebäude im Komplex, Etage wandert als „EG" hinein
CREATE OR REPLACE FUNCTION public.convert_floor_to_building(p_floor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src uuid; v_tenant uuid; v_complex uuid; v_name text; v_new uuid;
BEGIN
  SELECT location_id, name INTO v_src, v_name FROM public.floors WHERE id = p_floor_id;
  IF v_src IS NULL THEN RAISE EXCEPTION 'Etage nicht gefunden'; END IF;
  v_tenant := public._can_restructure_location(v_src);
  v_complex := public._complex_of(v_src);
  IF v_complex IS NULL THEN RAISE EXCEPTION 'Nur innerhalb eines Gebäudekomplexes möglich'; END IF;
  INSERT INTO public.locations (tenant_id, name, type, parent_id, show_on_map)
  VALUES (v_tenant, v_name, 'einzelgebaeude', v_complex, false) RETURNING id INTO v_new;
  PERFORM public._move_floor_to(p_floor_id, v_new);
  UPDATE public.floors SET name = 'EG', floor_number = 0 WHERE id = p_floor_id;
  RETURN v_new;
END $$;

-- Gebäude in Etage umwandeln: nur ohne Untergebäude und mit höchstens einer Etage; Gebäude wird danach entfernt (scheitert sicher, falls noch andere Daten daran hängen)
CREATE OR REPLACE FUNCTION public.convert_building_to_floor(p_location_id uuid, p_target_location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t1 uuid; v_t2 uuid; v_name text; v_floor uuid; v_cnt int;
BEGIN
  v_t1 := public._can_restructure_location(p_location_id);
  v_t2 := public._can_restructure_location(p_target_location_id);
  IF p_location_id = p_target_location_id OR v_t1 <> v_t2 THEN RAISE EXCEPTION 'Ungültiges Ziel'; END IF;
  IF public._complex_of(p_location_id) IS NULL OR public._complex_of(p_location_id) IS DISTINCT FROM public._complex_of(p_target_location_id)
     OR (SELECT type FROM public.locations WHERE id = p_location_id) = 'gebaeudekomplex' THEN
    RAISE EXCEPTION 'Ziel muss im selben Gebäudekomplex liegen';
  END IF;
  IF EXISTS (SELECT 1 FROM public.locations WHERE parent_id = p_location_id) THEN RAISE EXCEPTION 'Gebäude hat eigene Untergebäude'; END IF;
  SELECT count(*) INTO v_cnt FROM public.floors WHERE location_id = p_location_id;
  IF v_cnt > 1 THEN RAISE EXCEPTION 'Gebäude hat mehrere Etagen – bitte Etagen einzeln verschieben'; END IF;
  SELECT name INTO v_name FROM public.locations WHERE id = p_location_id;
  SELECT id INTO v_floor FROM public.floors WHERE location_id = p_location_id;
  IF v_floor IS NULL THEN
    INSERT INTO public.floors (location_id, name, floor_number) VALUES (p_target_location_id, v_name, 0);
  ELSE
    PERFORM public._move_floor_to(v_floor, p_target_location_id);
    UPDATE public.floors SET name = v_name WHERE id = v_floor;
  END IF;
  UPDATE public.meters SET location_id = p_target_location_id WHERE location_id = p_location_id;
  DELETE FROM public.locations WHERE id = p_location_id;
END $$;

REVOKE ALL ON FUNCTION public._can_restructure_location(uuid), public._complex_of(uuid), public._move_floor_to(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_floor_to_building(uuid,uuid), public.convert_floor_to_building(uuid), public.convert_building_to_floor(uuid,uuid) TO authenticated;

-- Neue Komplexe erhalten ein umbenennbares Platzhalter-Gebäude
CREATE OR REPLACE FUNCTION public.create_complex_placeholder_building()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'gebaeudekomplex' THEN
    INSERT INTO public.locations (tenant_id, name, type, parent_id, show_on_map)
    VALUES (NEW.tenant_id, 'Gebäude 1 (bitte umbenennen)', 'einzelgebaeude', NEW.id, false);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_complex_placeholder_building ON public.locations;
CREATE TRIGGER trg_complex_placeholder_building AFTER INSERT ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.create_complex_placeholder_building();

-- Backfill: Etagen direkt am Komplex in ein Platzhalter-Gebäude verschieben (idempotent)
DO $$
DECLARE r record; v_new uuid;
BEGIN
  FOR r IN SELECT DISTINCT l.id, l.tenant_id FROM public.locations l JOIN public.floors f ON f.location_id = l.id WHERE l.type = 'gebaeudekomplex' LOOP
    INSERT INTO public.locations (tenant_id, name, type, parent_id, show_on_map)
    VALUES (r.tenant_id, 'Gebäude 1 (bitte umbenennen)', 'einzelgebaeude', r.id, false) RETURNING id INTO v_new;
    UPDATE public.meters SET location_id = v_new WHERE floor_id IN (SELECT id FROM public.floors WHERE location_id = r.id);
    UPDATE public.floors SET location_id = v_new WHERE location_id = r.id;
  END LOOP;
END $$;