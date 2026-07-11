## Ziel
Prozentuale Beteiligung von AICONO (und optional Partner) an den jährlichen **Energiekosten-Einsparungen** eines Tenants. Baseline = historisches Referenzjahr, witterungsbereinigt. Ein Vertrag pro Tenant, umfasst alle Liegenschaften & Energiearten.

**Aktivierung:** Gain-Sharing ist ein eigenständiges, pro Tenant schaltbares Modul (analog zu Ladeinfrastruktur, Aufgabenverwaltung, Mieterstrom).

## Phasen

### Phase 0 — Modul-Registrierung
- Neuer Modul-Code `gain_sharing` in `ALL_MODULES` (`src/hooks/useTenantModules.tsx`), Label „Gain-Sharing (Einsparbeteiligung)".
- Eintrag in `SALES_MODULE_LABELS` (`src/lib/salesModuleLabels.ts`) für Sales-Scout/Angebote.
- Route-Mapping in `ROUTE_MODULE_MAP` und `NAV_MODULE_MAP` (`src/hooks/useModuleGuard.tsx`) für `/super-admin/savings-share` bzw. Tenant-Ansicht.
- Optional: Eintrag in `module_prices` als Migrationsseed (Standardpreis 0 €, konfigurierbar durch Super-Admin).
- Super-Admin Tenant-Modul-Dialog (`TenantModulesDialog`) erhält Schalter automatisch via `ALL_MODULES`.
- Regeln:
  - Nur wenn `gain_sharing` für Tenant aktiv: Tab „Einsparbeteiligung" im Super-Admin Tenant-Detail sichtbar, Tenant erscheint in `/super-admin/savings-share`-Übersicht, Partner-Read-View filtert entsprechend.
  - Deaktivierung sperrt UI (readonly-Hinweis), löscht **keine** bestehenden Verträge/Baselines/Settlements — Reaktivierung ist verlustfrei.

### Phase 1 — Datenmodell & Vertrag (Super-Admin only)
Neue Tabellen im `public`-Schema (mit GRANTs + RLS `has_role(auth.uid(),'super_admin')`):

**`tenant_savings_contracts`** — genau 1 aktiver Vertrag pro Tenant
- `tenant_id` (FK), `status` (`draft|active|paused|terminated`)
- `baseline_year` (int), `start_year` (int, ab wann Beteiligung abgerechnet wird)
- `aicono_share_pct` (numeric 0–100)
- `partner_share_pct_of_aicono` (numeric 0–100, default 0)
- `weather_normalize` (bool, default true)
- `price_basis` (`current_year_avg` | `contract_fixed`), `fixed_price_eur_per_kwh` (JSON je Energieart)
- `notes`, `created_by`, Timestamps
- Partial Unique Index: nur ein `status='active'` je `tenant_id`

**`tenant_savings_baselines`** — Baseline je Energieart (Aggregat über alle Liegenschaften)
- `contract_id`, `energy_type`
- `baseline_kwh_raw`, `baseline_hdd` (nullable, nur Heizenergien)
- `baseline_kwh_normalized`, `baseline_source` (`auto_from_meters | manual_override | invoice_based`)
- `override_reason` (nullable)
- Unique (`contract_id`, `energy_type`)

**`tenant_savings_settlements`** — Jahresabschluss
- `contract_id`, `period_year`, `status` (`draft|approved|invoiced|paid|void`)
- JSON `per_energy_type` (Snapshot: baseline_kwh, actual_kwh, hdd_factor, avg_price, savings_kwh, savings_eur)
- `total_savings_eur`, `aicono_amount_eur`, `partner_amount_eur`, `tenant_retained_eur`
- `approved_by`, `approved_at`, `invoice_ref` (Lexware später)
- Unique (`contract_id`, `period_year`)

### Phase 2 — Berechnungslogik (Edge Functions)
**`savings-share-baseline`** — Erstberechnung / Neuberechnung Baseline
- Historische Daten via `get_meter_period_sums_with_fallback` für `baseline_year`, aggregiert je Energieart über alle Tenant-Meter (Verbrauchsseite).
- Holt HDD für alle Liegenschaften des Tenants → gewichtetes HDD.
- Speichert `baseline_kwh_raw` + `baseline_kwh_normalized`. Manueller Override via UI.

**`savings-share-calculate`** — Settlement für ein Jahr
1. Ist-Verbrauch je Energieart (Aggregat) für `period_year`.
2. Witterungsbereinigung Heizenergien: `actual_norm = actual * (baseline_hdd / period_hdd)`.
3. Preis-Ermittlung: Jahresmittel aus `energy_prices` gewichtet nach Verbrauch, oder Vertrags-Fixpreis.
4. `savings_kwh = baseline_norm - actual_norm`; `savings_eur = savings_kwh * price`. Negative Werte = 0.
5. `aicono_amount = total_savings * aicono_share_pct/100`; `partner_amount = aicono_amount * partner_share_pct_of_aicono/100`; `tenant_retained = total - aicono_amount`.
6. Snapshot als `draft` speichern.

Beide Functions: JWT-Check auf `super_admin` **und** Modulcheck (`gain_sharing` für Tenant aktiv) — sonst 403.

### Phase 3 — Super-Admin UI
**Neuer Tab „Einsparbeteiligung" in `SuperAdminTenantDetail`** (nur wenn Modul aktiv):
- Karte: Vertragsstatus, Kern-Parameter, Buttons „Bearbeiten" / „Aktivieren" / „Pausieren".
- Karte „Baseline": Tabelle je Energieart (raw, normalized, HDD, Quelle), Actions „Neu berechnen" + „Manuell überschreiben" (Dialog mit Begründung).
- Karte „Abrechnungen": Liste aller Jahre, Status-Badge, Summe, Aufteilung. Buttons: „Für Jahr X berechnen", „Freigeben", „Auf gezahlt setzen", „Details" (Drilldown).

Bei inaktivem Modul: Hinweis-Karte „Modul Gain-Sharing für diesen Tenant nicht aktiv" mit Direktlink zum Modul-Dialog.

**Neue Übersichtsseite `/super-admin/savings-share`** (via `ModuleGuard` an `gain_sharing` gebunden, filtert auf Tenants mit aktivem Modul):
- KPI-Kacheln: aktive Verträge, Gesamt-Einsparung laufendes Jahr, offene Settlements, ausstehendes AICONO-Volumen.
- Tabelle aller Tenants mit aktivem Vertrag, Link → Tenant-Detail-Tab.

Alle Zahlen im deutschen Format (`toLocaleString("de-DE")`).

### Phase 4 — Partner-Sichtbarkeit (read-only)
- Im Partner-Portal neuer Menüpunkt „Einsparbeteiligung": Liste eigener Tenants **mit aktivem `gain_sharing`-Modul**, freigegebene Settlements + Partner-Anteil. Kein Edit, keine Rohdaten-Baseline.

## Bewusst NICHT in diesem Plan
- Automatischer Rechnungsversand / Lexware-Buchung → separate Story, nutzt `invoice_ref`.
- Beteiligung pro Liegenschaft (Datenmodell erweiterbar).
- CO2- oder PV-Erlös-Beteiligung.
- Tenant-Self-Service-Ansicht.
- Automatische Jahres-Trigger (pg_cron) — vorerst manuell.

## Betroffene Dateien (geplant)
- Migration: 3 neue Tabellen + GRANTs + RLS + Trigger + Partial-Unique-Index; optional Seed `module_prices`.
- Edit: `src/hooks/useTenantModules.tsx` (Modul-Code `gain_sharing`).
- Edit: `src/hooks/useModuleGuard.tsx` (Route-Mapping).
- Edit: `src/lib/salesModuleLabels.ts` (Sales-Label).
- Neu: `supabase/functions/savings-share-baseline/index.ts`, `savings-share-calculate/index.ts`
- Neu: `src/hooks/useTenantSavingsContract.ts`, `useTenantSavingsSettlements.ts`
- Neu: `src/components/super-admin/savings-share/` (ContractCard, BaselineTable, SettlementsTable, SettlementDetailDialog, ManualOverrideDialog)
- Neu: `src/pages/SuperAdminSavingsShare.tsx` + Route (mit `ModuleGuard`)
- Edit: `src/pages/SuperAdminTenantDetail.tsx` (neuer Tab, modul-gated).
- Edit: `src/components/super-admin/SuperAdminSidebar.tsx` (Menüpunkt).
- Phase 4: `src/pages/PartnerSavingsShare.tsx` + Partner-Sidebar-Eintrag.

## Reihenfolge der Umsetzung
1. Modul-Registrierung (`gain_sharing`) + Migration Tabellen
2. Baseline-Edge-Function + Vertrags-CRUD-UI + Baseline-UI (modul-gated)
3. Calculate-Edge-Function + Settlements-UI + Freigabe-Workflow
4. Übersichtsseite `/super-admin/savings-share`
5. Partner-Read-View
