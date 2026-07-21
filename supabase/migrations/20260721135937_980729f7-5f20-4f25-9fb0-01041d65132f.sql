
ALTER TABLE public.meter_power_readings_5min SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2
);
ALTER TABLE public.meter_period_totals SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05,
  fillfactor = 85
);
ALTER TABLE public.meter_loxone_daily_snapshots SET (
  autovacuum_vacuum_scale_factor = 0.02,
  fillfactor = 85
);
ALTER TABLE public.location_integrations SET (
  autovacuum_vacuum_scale_factor = 0.05,
  fillfactor = 80
);
ALTER TABLE public.charge_points SET (
  autovacuum_vacuum_scale_factor = 0.05,
  fillfactor = 80
);
ALTER TABLE public.energy_storages SET (
  autovacuum_vacuum_scale_factor = 0.05,
  fillfactor = 80
);
ALTER TABLE public.gateway_sensor_snapshots SET (
  autovacuum_vacuum_scale_factor = 0.05,
  fillfactor = 80
);
ALTER TABLE public.loxone_ws_session_log SET (
  autovacuum_vacuum_scale_factor = 0.05
);
ALTER TABLE public.bridge_raw_samples SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05
);
