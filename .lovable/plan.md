# Welle 6 — Super-Admin Komfort

Umfang: X1 (Map in Sidebar), X2 (Partner-Edit mit Tabs), X4 (Monitoring Alert-Regeln), X5 (Statistics historisch). X3 (Lexware) bleibt explizit aus.

## X1 — Map in SuperAdminSidebar
- `src/components/super-admin/SuperAdminSidebar.tsx`: neuen Eintrag `{ to: "/super-admin/map", icon: Map, label: "Karte" }` zwischen `gateways` und `monitoring` ergänzen.
- `Map`-Icon aus `lucide-react` importieren.
- Keine Routing-Änderung nötig (Route existiert bereits in `App.tsx`).

## X2 — Partner-Edit-Dialog mit Tabs „Basis | Billing | Branding"
- `src/pages/SuperAdminPartners.tsx`: Edit-Dialog (`editOpen`) umschließen mit `<Tabs defaultValue="basic">`.
  - **Basis**: Name, Slug (inkl. Slug-Check), E-Mail, Subdomain, Aktiv-Toggle.
  - **Billing**: BillingMode (wholesale/commission) + CommissionPct.
  - **Branding**: WhiteLabel-Toggle + alle bestehenden White-Label-Felder (BrandDisplayName, CustomDomain, Primary/Secondary/AccentColor, SupportEmail, LogoUrl/Upload).
- Reine UI-Umgruppierung — bestehende State-Variablen, Save-Logik und Validierung bleiben unverändert.
- Speichern-/Abbrechen-Footer bleibt außerhalb der Tabs.

## X4 — Monitoring Alert-Regeln
**DB-Migration** (`monitoring_alert_rules`):
- Felder: `metric_category` (text), `metric_name` (text), `comparator` (enum: `>`, `>=`, `<`, `<=`), `threshold` (numeric), `severity` (enum: `info`, `warning`, `critical`), `enabled` (bool, default true), `notify_email` (text, nullable), `created_by` (uuid).
- GRANTs für `authenticated` + `service_role`.
- RLS: nur `super_admin` (über `has_role`) darf lesen/schreiben.
- Unique-Constraint `(metric_category, metric_name, comparator)`.

**UI** (`src/pages/SuperAdminMonitoring.tsx`):
- Neue Card „Alert-Regeln" oberhalb der Health-Sektion.
- Tabelle: Kategorie, Metrik, Vergleich, Schwellwert, Severity, Status, Aktionen.
- „Regel hinzufügen"-Dialog mit Select (Kategorie/Metrik aus bekannten Metriken: `db_connections`, `disk_usage`, `app_counts`, …), Comparator, Threshold, Severity, optionale Notify-E-Mail.
- Inline-Toggle für `enabled`, Löschen pro Zeile.
- Auswertung clientseitig: für jede aktive Regel wird der letzte Wert (`getLatest`) geprüft; verletzte Regeln werden als Warn-Badge in der Card angezeigt. (Kein Mail-Versand in dieser Welle — Hook für späteren Edge-Job vorbereitet via `notify_email`-Spalte.)

## X5 — Statistics-Historie
**DB-Migration** (`platform_metrics`):
- Felder: `recorded_at` (timestamptz, default now), `metric_key` (text, z. B. `mrr_eur`, `active_tenants`, `module_adoption_<modul>`), `metric_value` (numeric), `dimension` (text, nullable, für Modul-Namen).
- Index `(metric_key, recorded_at desc)`.
- GRANTs `authenticated` SELECT, `service_role` ALL. RLS: nur `super_admin` darf lesen.
- Befüllung: in dieser Welle KEIN Cron — stattdessen liefert ein neuer Hook `useHistoricalPlatformMetrics()` Mock-/Live-Daten:
  - Live aus vorhandener `platform_statistics`-Tabelle (bereits abgefragt in `usePlatformStats`) plus den neuen `platform_metrics`-Inserts (initial leer, später durch separaten Job).
- Hinweis-Banner in UI: „Historie wird seit <erstes Datum> gesammelt".

**UI** (`src/pages/SuperAdminStatistics.tsx`):
- Bestehende 3 KPIs + 1 BarChart bleiben.
- Neue Sektion „Verlauf":
  - **LineChart MRR-Verlauf** (`metric_key = 'mrr_eur'`).
  - **LineChart aktive Tenants über Zeit** (`metric_key = 'active_tenants'`).
  - **PieChart Modul-Adoption** (Aggregation `metric_key LIKE 'module_adoption_%'`, letzter Wert pro `dimension`).
- Zahlen mit `toLocaleString("de-DE")`.

## Technische Details
- Migration X4 + X5 als zwei getrennte SQL-Migrationen.
- Kein Lexware-Code anfassen.
- Keine neuen npm-Pakete (Recharts, shadcn Tabs/Dialog/Select bereits vorhanden).
- Datei-Liste (geschätzt):
  - edit: `SuperAdminSidebar.tsx`, `SuperAdminPartners.tsx`, `SuperAdminMonitoring.tsx`, `SuperAdminStatistics.tsx`
  - new: `src/hooks/useMonitoringAlertRules.tsx`, `src/hooks/useHistoricalPlatformMetrics.tsx`, ggf. `src/components/super-admin/AlertRuleDialog.tsx`
  - 2 DB-Migrationen
