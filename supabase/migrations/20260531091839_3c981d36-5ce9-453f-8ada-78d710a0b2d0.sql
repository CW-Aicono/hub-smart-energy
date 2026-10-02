
-- Add super_admin SELECT policies to all tenant-scoped tables that currently lack one.
-- This unblocks the Remote-Support view so super_admins see the impersonated tenant's data.
-- Defensiv: ueberspringt Tabellen, die auf der jeweiligen DB nicht existieren (z.B. prod vs. cloud drift).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'alert_rules','arbitrage_strategies','arbitrage_trades','automation_execution_log',
    'automation_scenes','backup_snapshots','brighthub_settings','charging_invoice_counter',
    'charging_invoice_settings','co2_emission_factors','copilot_analyses','copilot_projects',
    'custom_roles','custom_widget_definitions','email_templates','energy_measures',
    'energy_prices','energy_report_archive','energy_report_drafts','energy_storages',
    'energy_supplier_invoices','external_contacts','gateway_commands','gateway_devices',
    'gateway_sensor_snapshots','integration_categories','integration_errors','integrations',
    'location_automations','location_energy_sources','meter_period_totals','meter_power_readings',
    'meter_power_readings_5min','meter_readings','meter_scanners','public_charge_status_links',
    'pv_actual_hourly','pv_forecast_hourly','pv_forecast_settings','report_schedules',
    'smart_meter_consents','smart_meter_mscons_imports','solar_charging_config','solar_charging_log',
    'task_attachments','task_history','tasks','tenant_electricity_invoices',
    'tenant_electricity_readings','tenant_electricity_settings','tenant_electricity_tariffs',
    'tenant_electricity_tenants','weather_degree_days'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'Skip %: table does not exist on this DB', t;
      CONTINUE;
    END IF;
    EXECUTE format(
      'DROP POLICY IF EXISTS "Super admins can view all %1$s" ON public.%1$I;',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Super admins can view all %1$s" ON public.%1$I FOR SELECT USING (has_role(auth.uid(), ''super_admin''::app_role));',
      t
    );
  END LOOP;
END $$;
