
-- Add columns for complex automation rules
ALTER TABLE public.location_automations
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logic_operator text NOT NULL DEFAULT 'AND';

-- Add comment for documentation
COMMENT ON COLUMN public.location_automations.conditions IS 'Array of condition objects: {type, sensor_uuid, sensor_name, operator, value, unit, time_from, time_to, weekdays, expected_status}';
COMMENT ON COLUMN public.location_automations.actions IS 'Array of action objects: {actuator_uuid, actuator_name, control_type, action_type, action_value}';
COMMENT ON COLUMN public.location_automations.schedule IS 'Schedule config: {enabled, time, weekdays}';
COMMENT ON COLUMN public.location_automations.logic_operator IS 'AND or OR for combining conditions';
