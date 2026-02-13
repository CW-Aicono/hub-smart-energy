
-- Add new columns
ALTER TABLE charger_models ADD COLUMN IF NOT EXISTS power_kw numeric NULL;
ALTER TABLE charger_models ADD COLUMN IF NOT EXISTS charging_type text NOT NULL DEFAULT 'AC';

-- Update existing AC models with approximate power ratings
UPDATE charger_models SET power_kw = 7, charging_type = 'AC' WHERE vendor = 'ABB' AND model = 'Terra AC W7-T-RD-M';
UPDATE charger_models SET power_kw = 11, charging_type = 'AC' WHERE vendor = 'ABB' AND model = 'Terra AC W11-T-RD-M';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'ABB' AND model = 'Terra AC W22-T-RD-M';
UPDATE charger_models SET power_kw = 7.4, charging_type = 'AC' WHERE vendor = 'Alfen' AND model = 'Eve Single S-Line';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Alfen' AND model = 'Eve Single Pro-Line';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Alfen' AND model = 'Eve Double Pro-Line';
UPDATE charger_models SET power_kw = 7.4, charging_type = 'AC' WHERE vendor = 'Easee' AND model = 'Home';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Easee' AND model = 'Charge';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'EVBox' AND model = 'Elvi';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'EVBox' AND model = 'BusinessLine';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'go-e' AND model = 'Charger Gemini';
UPDATE charger_models SET power_kw = 11, charging_type = 'AC' WHERE vendor = 'go-e' AND model = 'Charger Gemini Flex';
UPDATE charger_models SET power_kw = 11, charging_type = 'AC' WHERE vendor = 'Heidelberg' AND model = 'Energy Control';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'KEBA' AND model = 'KeContact P30 x-series';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'KEBA' AND model = 'KeContact P30 c-series';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Mennekes' AND model = 'Amtron Charge Control';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Mennekes' AND model = 'Amtron Xtra 11/22';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'NRGkick' AND model = 'NRGkick Smart';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Schneider Electric' AND model = 'EVlink Pro AC';
UPDATE charger_models SET power_kw = 7.4, charging_type = 'AC' WHERE vendor = 'Wallbox' AND model = 'Pulsar Plus';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Wallbox' AND model = 'Pulsar Pro';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Wallbox' AND model = 'Commander 2';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Webasto' AND model = 'Unite';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Webasto' AND model = 'Live';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Zaptec' AND model = 'Go';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'Zaptec' AND model = 'Pro';
UPDATE charger_models SET power_kw = 7, charging_type = 'AC' WHERE vendor = 'DUOSIDA' AND model = 'DSD1-EU 7kW';
UPDATE charger_models SET power_kw = 22, charging_type = 'AC' WHERE vendor = 'DUOSIDA' AND model = 'DSD1-EU 22kW';

-- Insert DC fast charging models
INSERT INTO charger_models (vendor, model, protocol, notes, is_active, power_kw, charging_type) VALUES
  ('ABB', 'Terra 54', 'ocpp1.6', 'CCS/CHAdeMO, LAN/SIM, 50 kW DC', true, 50, 'DC'),
  ('ABB', 'Terra 124', 'ocpp1.6', 'CCS/CHAdeMO, LAN/SIM, 120 kW DC', true, 120, 'DC'),
  ('ABB', 'Terra 184', 'ocpp1.6', 'CCS/CHAdeMO, LAN/SIM, 180 kW DC', true, 180, 'DC'),
  ('ABB', 'Terra HP', 'ocpp1.6', 'CCS, bis 350 kW, modulares Design', true, 350, 'DC'),
  ('ABB', 'Terra DC Wallbox', 'ocpp1.6', 'CCS, 24 kW DC Kompaktlader', true, 24, 'DC'),
  ('Alpitronic', 'Hypercharger HYC 50', 'ocpp1.6', 'CCS/CHAdeMO, kompakt, LAN/SIM', true, 50, 'DC'),
  ('Alpitronic', 'Hypercharger HYC 150', 'ocpp1.6', 'CCS/CHAdeMO, LAN/SIM, modularer Aufbau', true, 150, 'DC'),
  ('Alpitronic', 'Hypercharger HYC 300', 'ocpp1.6', 'CCS/CHAdeMO, LAN/SIM, bis 2 Ladepunkte', true, 300, 'DC'),
  ('Alpitronic', 'Hypercharger HYC 400', 'ocpp2.0.1', 'CCS, OCPP 2.0.1, bis 400 kW', true, 400, 'DC'),
  ('Kempower', 'Satellite', 'ocpp1.6', 'CCS, modulare Satelliten-Architektur, dynamisches Lastmanagement', true, 40, 'DC'),
  ('Kempower', 'Station Charger S-Series', 'ocpp1.6', 'CCS, bis 200 kW, fuer oeffentliches Laden', true, 200, 'DC'),
  ('Kempower', 'Station Charger C-Series', 'ocpp2.0.1', 'CCS, bis 600 kW, OCPP 2.0.1, High-Power Charging', true, 600, 'DC'),
  ('Tritium', 'RTM 50', 'ocpp1.6', 'CCS/CHAdeMO, kompakter 50 kW DC-Lader', true, 50, 'DC'),
  ('Tritium', 'PKM 150', 'ocpp1.6', 'CCS/CHAdeMO, 150 kW, fluessigkeitsgekuehlt', true, 150, 'DC'),
  ('Tritium', 'PK 350', 'ocpp1.6', 'CCS, 350 kW, High-Power Charging', true, 350, 'DC'),
  ('Delta', 'City 100', 'ocpp1.6', 'CCS/CHAdeMO, 100 kW, Slim-Design', true, 100, 'DC'),
  ('Delta', 'Ultra Fast 200', 'ocpp1.6', 'CCS, 200 kW, modularer Aufbau', true, 200, 'DC'),
  ('Delta', 'Ultra Fast 400', 'ocpp2.0.1', 'CCS, 400 kW, OCPP 2.0.1', true, 400, 'DC'),
  ('Compleo', 'eTower DC 50', 'ocpp1.6', 'CCS/CHAdeMO, 50 kW, eichrechtskonform', true, 50, 'DC'),
  ('Compleo', 'eTower DC 150', 'ocpp1.6', 'CCS, 150 kW, eichrechtskonform, MID-Zaehler', true, 150, 'DC'),
  ('Circontrol', 'Raption 50', 'ocpp1.6', 'CCS/CHAdeMO, 50 kW, Outdoor-faehig', true, 50, 'DC'),
  ('Circontrol', 'Raption 150', 'ocpp1.6', 'CCS, 150 kW, modulares Design', true, 150, 'DC'),
  ('Ekoenergetyka', 'Axon Basic 50', 'ocpp1.6', 'CCS/CHAdeMO, 50 kW', true, 50, 'DC'),
  ('Ekoenergetyka', 'Axon Fast 150', 'ocpp1.6', 'CCS, 150 kW, LAN/SIM', true, 150, 'DC'),
  ('Eaton', 'Green Motion DC 22', 'ocpp1.6', 'CCS, 22 kW DC, Kompaktlader fuer Flotten', true, 22, 'DC'),
  ('Schneider Electric', 'EVlink Fast 24', 'ocpp1.6', 'CCS/CHAdeMO, 24 kW DC', true, 24, 'DC'),
  ('EVBox', 'Troniq Modular', 'ocpp1.6', 'CCS/CHAdeMO, 50-240 kW, modularer Aufbau', true, 240, 'DC'),
  ('Wallbox', 'Supernova', 'ocpp1.6', 'CCS, 65 kW DC, kompakt', true, 65, 'DC');
