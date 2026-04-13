
ALTER TABLE public.charge_point_connectors
ADD COLUMN display_order integer NOT NULL DEFAULT 0;

-- Set initial display_order to match connector_id
UPDATE public.charge_point_connectors SET display_order = connector_id;
