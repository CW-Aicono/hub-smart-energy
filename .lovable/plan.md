
# Peak-Shaving-Modul

Eigenständiges, im Super-Admin separat buchbares Modul, das Batteriespeicher gezielt zur Kappung von Leistungsspitzen einsetzt und die eingesparten Netzentgelte live ausweist. Generisch nutzbar (Industrie, Gewerbe, Arenen, Events). Phase 1 = Schwellwert-Logik, Phase 2 = Event-Kalender on top.

## Wirtschaftlicher Hintergrund (für Verkauf & UI-Texte)

RLM-Kunden (Großverbraucher ab 100.000 kWh/Jahr) zahlen Netzentgelt zweigeteilt:
- **Arbeitspreis** (ct/kWh)
- **Leistungspreis** (€/kW/Jahr) auf die **höchste 15-Minuten-Viertelstundenleistung** des Abrechnungszeitraums

Eine einzige gekappte 300-kW-Spitze bei 150 €/kW/Jahr = **45.000 €/Jahr Einsparung**.

## Phase 1 — Generisches Peak-Shaving (Modul-Kern)

### 1. Neues Modul registrieren
- Eintrag in `module_prices` (Key: `peak_shaving`, Name: "Peak-Shaving & Netzentgelt-Optimierung")
- Super-Admin aktiviert pro Tenant via `tenant_modules` (bestehende Logik, kein neuer Code)
- `ModuleGuard` schützt alle neuen Routen/Widgets

### 2. Datenbank
Neue Tabellen:

| Tabelle | Zweck |
|---|---|
| `peak_shaving_configs` | Konfiguration pro Standort: `location_id`, `storage_id`, `peak_limit_kw`, `reserve_soc_pct`, `mode` (`threshold` \| `forecast` \| `event`), `network_tariff_eur_per_kw_year`, `billing_cycle` (`monthly` \| `yearly`), `active` |
| `peak_shaving_events` | Jeder Eingriff: `config_id`, `started_at`, `ended_at`, `peak_kw_without_shaving` (extrapoliert), `peak_kw_actual`, `kwh_discharged`, `eur_saved` |
| `peak_shaving_monthly_summary` | Aggregat: `config_id`, `year`, `month`, `max_peak_kw`, `baseline_peak_kw`, `total_kwh_discharged`, `total_eur_saved` |
| `peak_shaving_event_calendar` (Phase 2) | `config_id`, `event_name`, `start_at`, `end_at`, `expected_peak_kw`, `pre_charge_target_soc` |

Plus RLS (`tenant_id` + Modul-Aktivierung), GRANTs, Realtime auf `peak_shaving_events` für Live-Dashboard.

### 3. Edge Function `peak-shaving-scheduler`
- Per `pg_cron` alle 60 s
- Pro aktivem `peak_shaving_configs`:
  1. Lese letzten Hauptzähler-Wert aus `meter_power_readings_5min` (Reuse `get_location_main_meter` RPC)
  2. **Hybrid-Logik:**
     - **Schwellwert-Teil:** Wenn aktuelle Leistung > `peak_limit_kw` → Entladung mit `min(max_discharge_kw, current_kw − peak_limit_kw)` triggern
     - **15-Min-Prognose-Teil:** Laufende Viertelstunde tracken, linear extrapolieren; wenn prognostizierter VS-Mittelwert > Limit → frühzeitig anwerfen (RLM-konform)
  3. Speicher-Kommando schreiben (analog `dlm-scheduler` → `pending_ocpp_commands` bzw. neue Tabelle `pending_storage_commands` — abhängig vom Speicher-Typ; in Phase 1 nur Speicher mit lokaler Steuerung via EMS-Gateway / Modbus)
  4. `peak_shaving_events` schreiben/aktualisieren
  5. Bei Ende der Spitze: `peak_kw_without_shaving` einfrieren = Maximum der extrapolierten Werte, Einsparung berechnen:
     `eur_saved = (peak_kw_without_shaving − peak_kw_actual) × network_tariff_eur_per_kw_year / 12`
- Hysterese: Freigabe erst bei < 85 % der Schwelle, plus SoC-Reserve respektieren

### 4. UI — Tenant-Seite `/peak-shaving`
- **Konfigurations-Card:** Standort, Speicher zuordnen, Peak-Limit (kW), Netzentgelt (€/kW/Jahr), SoC-Reserve, Modus (Schwellwert / Schwellwert+Prognose)
- **Live-Dashboard-Widgets:**
  - "Aktuelle Leistung vs. Peak-Limit" (Echtzeit-Linie + roter Schwellwert)
  - "Speicher-Status" (SoC, aktuell entladene Leistung)
  - "Aktiver Eingriff" (Sekundenzähler, sofort eingespart)
- **KPI-Kacheln:** Monats-Maximum, Baseline-Maximum, kWh entladen, € gespart (Monat / YTD / Jahresprognose)
- **Verlaufschart:** Top-10-Spitzen des Monats (mit / ohne Peak-Shaving)
- **Event-Log-Tabelle:** Letzte Eingriffe, sortier-/filterbar, CSV-Export

### 5. Super-Admin
- Eintrag in Modul-Liste, Preis (z. B. 49 €/Monat als Vorschlag, anpassbar)
- Übersicht "Peak-Shaving-Performance" über alle Tenants (€ gespart aggregiert) — gutes Vertriebsargument

## Phase 2 — Erweiterungen (separat, nach Abnahme Phase 1)

- **Event-Kalender** (`peak_shaving_event_calendar`): Vor Event-Beginn lädt Speicher gezielt auf, Modus `event` aktivierbar
- **Branchen-Presets:** "Arena/Konzert", "Industrie 1-Schicht", "Logistik 24/7" mit Default-Limits
- **PDF-Report:** Monatlicher Auto-Report "Eingesparte Netzentgelte" in bestehende `report_schedules`-Logik einklinken
- **Multi-Storage:** Lastverteilung über mehrere Speicher pro Standort

## Technischer Abschnitt

```text
                      ┌──────────────────────┐
   meter_power_       │ peak-shaving-        │   pending_storage_
   readings_5min ───► │ scheduler (1 min)    │ ──► commands → Gateway/Modbus
                      │ - Schwellwert        │
   peak_shaving_      │ - 15-Min-Prognose    │   peak_shaving_events
   configs       ───► │ - Hysterese          │ ──► (Realtime)
                      │ - SoC-Reserve        │
   energy_storages ──►│                      │   peak_shaving_monthly_
                      └──────────────────────┘   summary (täglich rollup)
```

- Reuse: `dlm-scheduler`-Architektur (Limit-Check + Stack-Level), `arbitrage_strategies` (Speicher-Adressierung), `get_location_main_meter` RPC, `ModuleGuard`, `useTenantQuery`, deutsche Zahlenformate, AICONO-Farben.
- Neue Edge Function nur für Peak-Shaving; bewusst getrennt von `dlm-scheduler`, weil andere Logik (entladen statt drosseln) und andere Zielgeräte (Speicher statt Wallbox).
- Speicher-Ansteuerung in Phase 1 nur für Speicher, die bereits über das AICONO-EMS-Gateway / Modbus erreichbar sind (vorhandene `energy_storages`-Einträge mit konfiguriertem `location_id`).

## Was bewusst NICHT in Phase 1 ist

- Spot-Markt-Arbitrage (existiert separat in `arbitrage_strategies`, kein Mehraufwand verbauen)
- Event-Kalender → Phase 2
- PDF-Report → Phase 2
- VPP / Marktteilnahme → eigenes späteres Modul
