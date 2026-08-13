CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'feature',
  status text NOT NULL DEFAULT 'backlog',
  impact smallint NOT NULL DEFAULT 3,
  effort smallint NOT NULL DEFAULT 3,
  risk smallint NOT NULL DEFAULT 3,
  rank integer NOT NULL DEFAULT 0,
  owner text,
  due_date date,
  plan_ref text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_items TO authenticated;
GRANT ALL ON public.roadmap_items TO service_role;
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage roadmap items"
ON public.roadmap_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.roadmap_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.roadmap_item_history TO authenticated;
GRANT ALL ON public.roadmap_item_history TO service_role;
ALTER TABLE public.roadmap_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read roadmap history"
ON public.roadmap_item_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins write roadmap history"
ON public.roadmap_item_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_roadmap_items_status_rank ON public.roadmap_items (status, rank);
CREATE INDEX idx_roadmap_item_history_item ON public.roadmap_item_history (item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.roadmap_items_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roadmap_items_touch
BEFORE UPDATE ON public.roadmap_items
FOR EACH ROW EXECUTE FUNCTION public.roadmap_items_touch();

CREATE OR REPLACE FUNCTION public.roadmap_items_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.roadmap_item_history(item_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;
  IF NEW.owner IS DISTINCT FROM OLD.owner THEN
    INSERT INTO public.roadmap_item_history(item_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'owner', OLD.owner, NEW.owner, auth.uid());
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.roadmap_item_history(item_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'title', OLD.title, NEW.title, auth.uid());
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.roadmap_item_history(item_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'due_date', OLD.due_date::text, NEW.due_date::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roadmap_items_history
AFTER UPDATE ON public.roadmap_items
FOR EACH ROW EXECUTE FUNCTION public.roadmap_items_log_history();