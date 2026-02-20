
-- =============================================
-- MODUL: Arbitragehandel (Strom)
-- =============================================

-- Energiespeicher
CREATE TABLE public.energy_storages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  capacity_kwh NUMERIC NOT NULL DEFAULT 0,
  max_charge_kw NUMERIC NOT NULL DEFAULT 0,
  max_discharge_kw NUMERIC NOT NULL DEFAULT 0,
  efficiency_pct NUMERIC NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.energy_storages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view energy storages in their tenant" ON public.energy_storages FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert energy storages" ON public.energy_storages FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update energy storages" ON public.energy_storages FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete energy storages" ON public.energy_storages FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_energy_storages_updated_at BEFORE UPDATE ON public.energy_storages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Spotpreise (global, kein tenant_id)
CREATE TABLE public.spot_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_area TEXT NOT NULL DEFAULT 'DE-LU',
  price_eur_mwh NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'day_ahead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.spot_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view spot prices" ON public.spot_prices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE INDEX idx_spot_prices_timestamp ON public.spot_prices (timestamp DESC);
CREATE INDEX idx_spot_prices_market_area ON public.spot_prices (market_area, timestamp DESC);

-- Arbitrage-Strategien
CREATE TABLE public.arbitrage_strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  storage_id UUID NOT NULL REFERENCES public.energy_storages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  buy_below_eur_mwh NUMERIC NOT NULL DEFAULT 30,
  sell_above_eur_mwh NUMERIC NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.arbitrage_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view arbitrage strategies in their tenant" ON public.arbitrage_strategies FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert arbitrage strategies" ON public.arbitrage_strategies FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update arbitrage strategies" ON public.arbitrage_strategies FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete arbitrage strategies" ON public.arbitrage_strategies FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_arbitrage_strategies_updated_at BEFORE UPDATE ON public.arbitrage_strategies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Arbitrage-Trades
CREATE TABLE public.arbitrage_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  storage_id UUID NOT NULL REFERENCES public.energy_storages(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.arbitrage_strategies(id) ON DELETE SET NULL,
  trade_type TEXT NOT NULL DEFAULT 'charge',
  energy_kwh NUMERIC NOT NULL DEFAULT 0,
  price_eur_mwh NUMERIC NOT NULL DEFAULT 0,
  revenue_eur NUMERIC NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.arbitrage_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view arbitrage trades in their tenant" ON public.arbitrage_trades FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert arbitrage trades" ON public.arbitrage_trades FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update arbitrage trades" ON public.arbitrage_trades FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete arbitrage trades" ON public.arbitrage_trades FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- MODUL: Mieterstrom
-- =============================================

-- Mieter
CREATE TABLE public.tenant_electricity_tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_label TEXT,
  email TEXT,
  meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
  move_in_date DATE,
  move_out_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_electricity_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant electricity tenants" ON public.tenant_electricity_tenants FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert tenant electricity tenants" ON public.tenant_electricity_tenants FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant electricity tenants" ON public.tenant_electricity_tenants FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant electricity tenants" ON public.tenant_electricity_tenants FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_tenant_electricity_tenants_updated_at BEFORE UPDATE ON public.tenant_electricity_tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tarife
CREATE TABLE public.tenant_electricity_tariffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_per_kwh_local NUMERIC NOT NULL DEFAULT 0,
  price_per_kwh_grid NUMERIC NOT NULL DEFAULT 0,
  base_fee_monthly NUMERIC NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_electricity_tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant electricity tariffs" ON public.tenant_electricity_tariffs FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert tenant electricity tariffs" ON public.tenant_electricity_tariffs FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant electricity tariffs" ON public.tenant_electricity_tariffs FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant electricity tariffs" ON public.tenant_electricity_tariffs FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Ablesungen
CREATE TABLE public.tenant_electricity_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_electricity_tenant_id UUID NOT NULL REFERENCES public.tenant_electricity_tenants(id) ON DELETE CASCADE,
  meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
  reading_value NUMERIC NOT NULL,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reading_type TEXT NOT NULL DEFAULT 'regular',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_electricity_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant electricity readings" ON public.tenant_electricity_readings FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert tenant electricity readings" ON public.tenant_electricity_readings FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant electricity readings" ON public.tenant_electricity_readings FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant electricity readings" ON public.tenant_electricity_readings FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Rechnungen
CREATE TABLE public.tenant_electricity_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_electricity_tenant_id UUID NOT NULL REFERENCES public.tenant_electricity_tenants(id) ON DELETE CASCADE,
  tariff_id UUID REFERENCES public.tenant_electricity_tariffs(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  local_kwh NUMERIC NOT NULL DEFAULT 0,
  grid_kwh NUMERIC NOT NULL DEFAULT 0,
  total_kwh NUMERIC NOT NULL DEFAULT 0,
  local_amount NUMERIC NOT NULL DEFAULT 0,
  grid_amount NUMERIC NOT NULL DEFAULT 0,
  base_fee NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_electricity_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant electricity invoices" ON public.tenant_electricity_invoices FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert tenant electricity invoices" ON public.tenant_electricity_invoices FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant electricity invoices" ON public.tenant_electricity_invoices FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant electricity invoices" ON public.tenant_electricity_invoices FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Einstellungen
CREATE TABLE public.tenant_electricity_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  pv_meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
  grid_meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
  allocation_method TEXT NOT NULL DEFAULT 'proportional',
  billing_period TEXT NOT NULL DEFAULT 'monthly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_electricity_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant electricity settings" ON public.tenant_electricity_settings FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert tenant electricity settings" ON public.tenant_electricity_settings FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant electricity settings" ON public.tenant_electricity_settings FOR UPDATE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant electricity settings" ON public.tenant_electricity_settings FOR DELETE USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_tenant_electricity_settings_updated_at BEFORE UPDATE ON public.tenant_electricity_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
