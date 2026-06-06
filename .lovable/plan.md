
# Umsetzungspläne: K2 §14a EnWG · K6 Dynamisches DLM · K7 Auslastungs-Heatmap + Standort-ROI

Drei separate, unabhängig deploybare Features. Reihenfolge-Empfehlung: **K7 → K6 → K2** (steigender Aufwand, K7 liefert Daten­grundlage für K6/K2-Reporting).

---

## K7 — Auslastungs-Heatmap + Standort-ROI  (Quick Win, ~1 Tag)

### Ziel
Betreiber sieht pro Ladepunkt/Gruppe/Standort:
- Heatmap Wochentag × Stunde (Belegung in % bzw. kWh)
- ROI-Karte: Investition, kumulierte Erlöse, Amortisations­datum, €/Monat-Trend

### Datenmodell
Neue Tabelle `charge_point_economics` (nur Stammdaten – Sessions liegen schon in `charging_sessions`):
```
charge_point_id PK FK
tenant_id
capex_cents          int      -- Investition inkl. Installation
opex_monthly_cents   int      -- Wartung/Stellplatzmiete
commissioned_on      date     -- Inbetriebnahme
electricity_cost_eur_per_kwh numeric  -- Einkauf (fallback wenn kein Tarif gemappt)
```
RLS: tenant_id-Scope (analog `charge_points`). GRANTs Standard.

### Backend
- **Keine** neue Edge-Function nötig (Aggregation läuft client-seitig auf bestehenden Sessions; Datenmenge unkritisch <50k Zeilen).
- Optional später: Materialized View für >100k Sessions, jetzt nicht.

### Frontend
1. Neuer Tab **„Auslastung & ROI"** in `ChargePointDetail.tsx` und neuer Sub-Tab in `ChargingPoints.tsx` (Standort-Sicht).
2. Komponente `src/components/charging/UtilizationHeatmap.tsx`:
   - 7×24 Grid, Farbintensität via `hsl(var(--primary) / x)`.
   - Filter: kWh / Belegungs­minuten / Anzahl Sessions.
   - Zeitraum-Picker (30 d / 90 d / 12 m / custom), DE-Datums­format.
3. Komponente `src/components/charging/RoiCard.tsx`:
   - Eingaben: CAPEX/OPEX/Strompreis aus `charge_point_economics` (Inline-Edit-Dialog).
   - Berechnung: Umsatz aus `charging_sessions.energy_kwh * tariff.price_per_kwh` − Strom­kosten − OPEX.
   - KPIs: kumulierter Cashflow, ø €/Monat letzte 6 M, Payback-Datum (linear extrapoliert).
   - Mini-Chart Cashflow kumuliert (Recharts AreaChart).
4. Standort-Sicht: Summen aller zugeordneten CPs (direkt + via Gruppe, Hook `useLocationChargePoints` schon vorhanden).
5. Export: „CSV herunterladen" für Heatmap und ROI-Reihe.

### Tests
- `utilizationHeatmap.test.ts`: Aggregation aus 1000 synthetischen Sessions → richtige 7×24-Matrix.
- `roiCalc.test.ts`: bekannte Eingaben → Payback-Monat, kumulierter CF.

### Akzeptanzkriterien
- Heatmap rendert <300 ms bei 10k Sessions.
- ROI-Werte deutsch formatiert (`toLocaleString("de-DE")`, „€").
- ModuleGuard: nur sichtbar wenn Modul `ev-charging` aktiv.

---

## K6 — Dynamisches DLM auf Hausanschluss-Messung  (mittel, ~3–4 Tage)

### Ziel
Echtzeit-Lastregelung: Wenn Hausanschluss­messung (Smart Meter / Schneider PM / Modbus) sich einer konfigurierten Obergrenze nähert, drosselt das System die Wallboxen automatisch via OCPP `SetChargingProfile`, statt nur statischer Zeitfenster.

Unterschied zum bestehenden `dlm-scheduler`: dieser arbeitet auf Zeitplänen; K6 reagiert auf **Live-Messwert <15 s**.

### Datenmodell
```
location_dlm_config
  id PK
  tenant_id
  location_id  UNIQUE
  reference_meter_id   FK meters    -- Hausanschluss
  grid_limit_kw        numeric
  safety_buffer_kw     numeric default 2.0
  fallback_kw_per_cp   numeric default 4.2  -- bei Sensor-Ausfall
  control_interval_s   int default 30
  is_active            bool
  priority_order       jsonb         -- [cp_id1, cp_id2, ...] für Reduktions-Reihenfolge
  min_charge_kw        numeric default 1.4 -- darunter Pause statt Drossel
```
Neue Tabelle `dlm_control_log` (Audit, ringbuffer via pg_cron 30 Tage):
```
location_id, executed_at, measured_kw, available_kw, applied_profiles jsonb, reason text
```

### Backend
**Neue Edge-Function `dlm-realtime-controller`** (verify_jwt=false, intern getriggert):
- Wird minütlich von pg_cron aufgerufen UND zusätzlich durch Realtime-Trigger auf `meter_readings` (DB-Function, die `pg_net` Aufruf macht) bei jedem neuen Wert des Referenz­zählers.
- Liest letzten Messwert (max. 60 s alt), bei älter → fallback_kw_per_cp setzen.
- Berechnet `available_kw = grid_limit - measured - safety_buffer`, abzüglich nicht-EV-Lasten = bleibt EV-Budget.
- Verteilt nach `priority_order`: erster CP bekommt max, Rest absteigend bis budget < min_charge_kw → pausiert via `RemoteStopTransaction` oder Profile=0.
- Schickt pro CP `SetChargingProfile` via `ocpp-central` (vorhandener Pfad).
- Schreibt nach `dlm_control_log`.

Trigger-DB-Function:
```sql
create or replace function public.dlm_on_meter_reading() returns trigger ...
-- prüft ob NEW.meter_id in einer aktiven dlm-config ist, ruft via pg_net edge-function
```

### Frontend
1. Neuer Tab **„Dyn. Lastmanagement"** im Standort-Detail (`LocationDetail.tsx`).
2. Konfig-Dialog `src/components/charging/DynamicDlmConfig.tsx`:
   - Referenz-Zähler-Auswahl (Hook `useMeters` filter Hausanschluss).
   - Limit kW, Sicherheits­puffer, Min-Charge, Fallback.
   - Drag&Drop-Priorisierungsliste der CPs.
3. Live-Panel `DynamicDlmLivePanel.tsx`:
   - Realtime (Supabase Channel auf `dlm_control_log`): zeigt aktuelle Hausanschluss-Last, EV-Budget, je CP gesetztes Limit.
   - Mini-Chart letzte 60 min (Last, Limit, EV-Anteil).
4. Warnungen ins **Task-Modul** schreiben, wenn Referenzmessung >5 min veraltet.

### Tests
- Unit `dlmAllocation.test.ts`: gegebenes Budget + Prio-Liste → erwartete Profile.
- Integration: Mock-OCPP-Central, prüfe dass `SetChargingProfile` mit korrekten Strom­werten geschickt wird (16A / 6A / 0A).
- Edge-Test: alter Messwert → fallback aktiv.

### Akzeptanzkriterien
- Reaktion ≤30 s (Trigger-Pfad) bzw. ≤60 s (Cron-Pfad).
- Bei Sensor-Ausfall niemals >Σ fallback_kw_per_cp einplanen.
- Logs deutsch lokalisiert.
- ModuleGuard `ev-charging` + Standort hat min. 1 CP + 1 geeigneten Zähler.

---

## K2 — §14a EnWG Netzdienliche Steuerung  (mittel-hoch, ~4–5 Tage)

### Ziel
DSO-Steuersignal („Dimm-Befehl") wird empfangen und reduziert alle steuerbaren Verbrauchs­einrichtungen (SteuVE) am Netzanschluss­punkt auf gesetzlich erlaubten Wert (≥4,2 kW pro SteuVE). Unterstützt **Modul 1 (Direkte Steuerung)** und **Modul 2 (Pauschale Netzentgelt­reduzierung mit zeit­variablem Tarif)**.

Hinweis: echtes FNN-Steuerbox-Protokoll ist hardware­seitig — Lovable-Backend stellt die **Cloud-Seite** + **lokale Brücke im EMS-Gateway** bereit. Direkter physischer EEBus/CLS-Kanal wird in dieser Welle nicht implementiert (separates HW-Projekt), aber API-ready entworfen.

### Datenmodell
```
grid_operator_connections
  id PK
  tenant_id, location_id
  module enum('modul1','modul2','modul3')
  dso_name text
  connection_id text          -- Marktlokations-ID o.ä.
  webhook_secret text         -- HMAC für eingehende Steuerbefehle
  active bool

grid_curtailment_events
  id PK
  connection_id FK
  received_at, valid_from, valid_until
  curtailment_percent int     -- 0..100, 100=keine Drosselung
  source enum('webhook','manual','pg_cron')
  payload jsonb
  applied_at, applied_result jsonb

steuve_devices                -- alle steuerbaren Geräte (CPs, WP, Speicher)
  id PK
  tenant_id, connection_id FK
  device_type enum('charge_point','heat_pump','battery')
  device_ref_id uuid          -- FK je nach type
  min_power_kw numeric default 4.2
  priority int
```

### Backend
1. **Edge-Function `grid-curtailment-webhook`** (verify_jwt=false, HMAC-Header `x-dso-signature`):
   - Empfängt Dim-Signal vom DSO (oder Aggregator wie Gridhound/Sympower).
   - Validiert HMAC, schreibt `grid_curtailment_events`.
   - Ruft `grid-curtailment-apply` auf.
2. **Edge-Function `grid-curtailment-apply`**:
   - Iteriert über `steuve_devices` der Connection.
   - Pro CP: `SetChargingProfile` mit `(percent/100) * max_power_kw`, floor auf `min_power_kw`.
   - Pro Wärmepumpe (vorhanden in Building-Automation): setzt Modbus-Register oder schickt Aktor-Befehl via `automation-core`.
   - Pro Speicher: senkt Lade-Setpoint.
   - Schreibt Audit-Log (über `audit-log-write` aus Welle A4).
3. **Modul 2 Tarif-Variante**: Verknüpft mit `dynamic_pricing` — zeitvariables Netz­entgelt wird auf bestehende Spot-Preis-Anzeige addiert; neue Spalte `grid_fee_eur_per_kwh` in `dynamic_prices` oder eigene Tabelle `dynamic_grid_fees`.
4. **pg_cron-Job**: Jede Stunde Tagesplan vom DSO ziehen (REST-Polling-Fallback, wenn Webhook ausfällt). Konfig pro `dso_name` in Code-Registry `src/lib/dsoRegistry.ts`.

### Frontend
1. Neue Seite `src/pages/GridCompliance.tsx` (Route `/grid-compliance`, ModuleGuard `ev-charging` oder neues Modul `grid-compliance`):
   - Liste der `grid_operator_connections` (eine pro Standort).
   - Konfig-Dialog: DSO wählen, Modul wählen, Webhook-URL+Secret generieren (Copy-Button).
   - Liste der `steuve_devices` mit Priorisierung und min_power_kw.
2. Live-Status-Karte: aktueller Curtailment-Prozentsatz, Restzeit, betroffene Geräte (Badges).
3. Historie-Tab: Tabelle Events letzte 90 Tage, Filter nach Standort, CSV-Export.
4. Banner im **Charging-Dashboard** und **Wärmepumpen-Dashboard**, wenn aktive Drosselung läuft („§14a EnWG aktiv – Leistung begrenzt auf X kW bis HH:MM").

### Edge-Cases / Compliance
- Min-Leistung gesetzlich 4,2 kW pro SteuVE bei Direkt­steuerung → niemals unterschreiten.
- Nicht-Aussteuerung wenn `connection.active = false` (Opt-out durch Kunde mit Hinweis auf entfallende Modul-2-Reduzierung).
- Audit-Log: jeder Befehl mit Zeitstempel, Quelle, Ergebnis (für DSO-Nachweis).

### Tests
- Unit: HMAC-Validierung, Anti-Replay (received_at-Fenster ±5 min).
- Allocation-Tests pro Modul (1/2).
- Edge-Integration: Mock-DSO-Webhook → SetChargingProfile-Aufruf mit korrektem Wert.

### Akzeptanzkriterien
- Webhook reagiert <2 s, Geräte­drosselung <30 s.
- Min-Leistung wird nie unterschritten.
- Alle Drosselungen im Audit-Log (Pflicht für DSO-Nachweise).
- Deutsch lokalisiert, Datum/Zeit Europe/Berlin.

---

## Übergreifende Punkte

- **Audit-Log (Welle 2 A4)**: K6 + K2 nutzen `audit-log-write` bei jeder Steuer­aktion.
- **i18n**: Texte in `de.ts/en.ts/es.ts/nl.ts` (4 Sprachen, type-safe `t()`).
- **Multi-Tenancy**: jede neue Tabelle mit `tenant_id`, RLS-Policies analog bestehender CP-Tabellen, GRANTs in derselben Migration.
- **ModuleGuard**: Features hinter Modul `ev-charging` (K6/K7) bzw. eigenes Modul `grid-compliance` (K2) für separates Pricing.
- **Realtime**: K6-Live-Panel und K2-Status nutzen Supabase Channels auf den neuen Tabellen → `ALTER PUBLICATION supabase_realtime ADD TABLE …` jeweils in Migration.

## Nicht enthalten
- Tatsächliche FNN-Steuerbox-Hardware­integration (eigenes HW-Projekt).
- Roaming/OCPI (ausgenommen).
- ISO 15118 / Plug & Charge (K5).
- Sales-/Marketing-Material.

## Reihenfolge & Aufwand
| Feature | Aufwand | Risiko | Ergebnis sichtbar |
|---|---|---|---|
| K7 | 1 d | sehr niedrig | sofort (Heatmap+ROI) |
| K6 | 3–4 d | mittel (OCPP-Timing) | nach Smoke-Test mit echter Wallbox |
| K2 | 4–5 d | mittel (DSO-Abstimmung) | nach Webhook-Konfig mit DSO/Aggregator |

**Nach Freigabe** starte ich mit **K7** (kleinster Scope, liefert sofort Mehrwert) — sofern keine andere Reihenfolge gewünscht.
