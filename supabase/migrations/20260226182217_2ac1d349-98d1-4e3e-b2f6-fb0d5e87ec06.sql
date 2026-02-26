
ALTER TABLE meter_period_totals DROP CONSTRAINT meter_period_totals_period_type_check;
ALTER TABLE meter_period_totals ADD CONSTRAINT meter_period_totals_period_type_check 
  CHECK (period_type = ANY (ARRAY['month', 'year', 'day']));
