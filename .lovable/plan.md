
# Zwei neue Module: Arbitragehandel und Mieterstrom

## Hintergrund & Recherche

### Modul 1: Arbitragehandel (Strom)
Arbitrage im Strommarkt bedeutet, Strom zu kaufen wenn er guenstig ist (z.B. nachts, bei viel Wind/Sonne) und ihn zu nutzen/einzuspeisen wenn er teuer ist. Fuer B2B-Kunden mit Batteriespeichern oder flexiblen Lasten ist das eine echte Erloesoption.

**Kernfunktionen:**
- **Spotmarkt-Preisintegration**: Abruf aktueller Day-Ahead-Preise (EPEX Spot) ueber eine oeffentliche API (z.B. energy-charts.info oder ENTSO-E Transparency Platform)
- **Speicher-Management**: Batteriespeicher registrieren mit Kapazitaet, Lade-/Entladeleistung, Wirkungsgrad
- **Handelsstrategien**: Einfache Schwellwert-Strategien (kaufen unter X ct/kWh, verkaufen ueber Y ct/kWh)
- **Erloes-Tracking**: Historische Aufzeichnung aller Lade-/Entladezyklen mit Gewinn/Verlust-Berechnung
- **Dashboard-Widget**: Aktueller Spotpreis, Tagesverlauf, Speicherstatus, kumulierter Gewinn

### Modul 2: Mieterstrom
Vermieter erzeugen Strom (typisch PV-Anlage) und liefern ihn direkt an Mieter. Die Abrechnung erfordert: Erzeugungsmessung, individuelle Verbrauchsmessung je Mieter, Reststromberechnung aus dem Netz, und regelkonforme Rechnungserstellung.

**Kernfunktionen:**
- **Mieterverwaltung**: Mieter mit Einheit/Wohnung, Zaehler-Zuordnung, Ein-/Auszugsdatum
- **Tarif-Konfiguration**: Mieterstromtarif (muss unter Grundversorgung liegen, 90%-Regel), Reststromtarif
- **Verbrauchs-Tracking**: Zuordnung PV-Erzeugung vs. Netzstrom je Mieter (proportional oder per Zaehler)
- **Abrechnungslauf**: Periodische Abrechnung (monatlich/quartalsweise) mit Rechnungsgenerierung
- **Mieter-Portal**: Einfache Verbrauchsuebersicht fuer Mieter (optional, spaetere Phase)

---

## Technischer Plan

### Phase 1: Datenbank-Schema

**Arbitragehandel - Neue Tabellen:**

```text
energy_storages
  id, tenant_id, location_id, name, capacity_kwh, max_charge_kw,
  max_discharge_kw, efficiency_pct, status, created_at, updated_at

spot_prices
  id, market_area (z.B. "DE-LU"), price_eur_mwh, timestamp,
  price_type ("day_ahead"/"intraday"), created_at

arbitrage_strategies
  id, tenant_id, storage_id, name, buy_below_eur_mwh,
  sell_above_eur_mwh, is_active, created_at, updated_at

arbitrage_trades
  id, tenant_id, storage_id, strategy_id, trade_type ("charge"/"discharge"),
  energy_kwh, price_eur_mwh, revenue_eur, timestamp, created_at
```

**Mieterstrom - Neue Tabellen:**

```text
tenant_electricity_tenants (Mieter)
  id, tenant_id, location_id, name, unit_label (z.B. "Whg 3"),
  email, meter_id (FK meters), move_in_date, move_out_date,
  status, created_at, updated_at

tenant_electricity_tariffs
  id, tenant_id, name, price_per_kwh_local (PV-Strom),
  price_per_kwh_grid (Reststrom), base_fee_monthly,
  valid_from, valid_until, created_at

tenant_electricity_readings
  id, tenant_id, tenant_electricity_tenant_id, meter_id,
  reading_value, reading_date, reading_type ("regular"/"move_in"/"move_out"),
  created_at

tenant_electricity_invoices
  id, tenant_id, tenant_electricity_tenant_id, tariff_id,
  period_start, period_end, local_kwh, grid_kwh, total_kwh,
  local_amount, grid_amount, base_fee, total_amount,
  invoice_number, status, issued_at, created_at

tenant_electricity_settings
  id, tenant_id, location_id, pv_meter_id (Erzeugungszaehler),
  grid_meter_id (Netzbezugszaehler), allocation_method
  ("proportional"/"metered"), billing_period ("monthly"/"quarterly"),
  created_at, updated_at
```

Alle Tabellen erhalten RLS-Policies nach dem bestehenden Muster (`tenant_id = get_user_tenant_id()`).

### Phase 2: Modul-Registrierung

Zwei neue Eintraege in `ALL_MODULES` (useTenantModules.tsx):
- `{ code: "arbitrage_trading", label: "Arbitragehandel (Strom)" }`
- `{ code: "tenant_electricity", label: "Mieterstrom" }`

Entsprechende Eintraege in `ROUTE_MODULE_MAP` und `NAV_MODULE_MAP` im ModuleGuard.

### Phase 3: Frontend - Arbitragehandel

**Neue Seiten:**
- `/arbitrage` - Hauptseite mit Tabs:
  - **Dashboard**: Aktueller Spotpreis-Chart (24h), Speicherstatus, Tagesgewinn
  - **Speicher**: Batteriespeicher verwalten (CRUD)
  - **Strategien**: Handelsstrategien konfigurieren (Schwellwerte)
  - **Trades**: Historische Handels-Uebersicht mit Gewinn/Verlust

**Neue Hooks:**
- `useEnergyStorages` - CRUD fuer Speicher
- `useSpotPrices` - Abruf aktueller/historischer Spotpreise
- `useArbitrageStrategies` - CRUD fuer Strategien
- `useArbitrageTrades` - Trades-Historie

**Dashboard-Widget:**
- Kompakter Spotpreis-Ticker + Speicherstatus fuer das Haupt-Dashboard

**Edge Function:**
- `fetch-spot-prices` - Holt stuendlich Day-Ahead-Preise von ENTSO-E/energy-charts API und schreibt sie in `spot_prices`

### Phase 4: Frontend - Mieterstrom

**Neue Seiten:**
- `/tenant-electricity` - Hauptseite mit Tabs:
  - **Uebersicht**: KPI-Karten (Gesamterzeugung, Eigenverbrauchsquote, Mieteranzahl, Umsatz)
  - **Mieter**: Mieterverwaltung (Name, Einheit, Zaehler-Zuordnung, Status)
  - **Tarife**: Mieterstromtarif und Reststromtarif konfigurieren
  - **Ablesungen**: Zaehlerstaende erfassen (manuell oder automatisch aus bestehenden Metern)
  - **Abrechnung**: Abrechnungslaeufe starten, Rechnungen generieren und versenden
  - **Einstellungen**: PV-Zaehler, Netzzaehler, Verteilmethode konfigurieren

**Neue Hooks:**
- `useTenantElectricityTenants` - CRUD Mieterverwaltung
- `useTenantElectricityTariffs` - Tarifverwaltung
- `useTenantElectricityReadings` - Zaehlerstaende
- `useTenantElectricityInvoices` - Rechnungen
- `useTenantElectricitySettings` - Konfiguration

**Abrechnungslogik:**
- Berechnung des Anteils PV-Strom vs. Netzstrom je Mieter (proportional nach Verbrauch oder direkt gemessen)
- Automatische Rechnungserstellung mit Aufschluesselung (Lokal-kWh x Tarif + Netz-kWh x Tarif + Grundgebuehr)
- Integration mit bestehendem E-Mail-Template-System fuer Rechnungsversand

### Phase 5: Super-Admin-Integration

- Beide Module erscheinen automatisch im TenantModulesDialog und auf der Module-Pricing-Seite
- Keine zusaetzlichen Super-Admin-Seiten noetig - die Module werden per Tenant aktiviert/deaktiviert

### Phase 6: Sidebar-Navigation

**Mandanten-Sidebar** (DashboardSidebar.tsx):
- Neuer Eintrag "Arbitragehandel" mit TrendingUp-Icon unter Energiedaten
- Neuer Eintrag "Mieterstrom" mit Home-Icon als eigener Hauptpunkt

---

## Zusammenfassung der Dateien

| Aktion | Datei |
|--------|-------|
| Migration | Neue Tabellen + RLS fuer beide Module |
| Bearbeiten | `useTenantModules.tsx` - 2 neue Module |
| Bearbeiten | `useModuleGuard.tsx` - Route-Mappings |
| Bearbeiten | `DashboardSidebar.tsx` - Nav-Eintraege |
| Bearbeiten | `App.tsx` - Neue Routen |
| Neu | `src/pages/ArbitrageTrading.tsx` |
| Neu | `src/pages/TenantElectricity.tsx` |
| Neu | `src/hooks/useEnergyStorages.tsx` |
| Neu | `src/hooks/useSpotPrices.tsx` |
| Neu | `src/hooks/useArbitrageStrategies.tsx` |
| Neu | `src/hooks/useArbitrageTrades.tsx` |
| Neu | `src/hooks/useTenantElectricityTenants.tsx` |
| Neu | `src/hooks/useTenantElectricityTariffs.tsx` |
| Neu | `src/hooks/useTenantElectricityInvoices.tsx` |
| Neu | `src/hooks/useTenantElectricitySettings.tsx` |
| Neu | `supabase/functions/fetch-spot-prices/index.ts` |
| Bearbeiten | `src/i18n/translations.ts` - Neue Uebersetzungsschluessel |

