ALTER TABLE public.meter_power_readings SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 5000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 1000
);