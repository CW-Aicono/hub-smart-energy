# Welle 3 — Partner-Portal Ausbau (P1–P5)

Ziel: Das Partner-Portal von „read-only / Basis" zu einem voll nutzbaren Self-Service-Backend ausbauen — White-Label, Reporting, Tenant-Verwaltung, feingranulare Rechte, harte Server-Guards.

Reihenfolge: **P4 → P5 → P1 → P3 → P2** (erst Rechte- und Server-Härtung, dann UI-Erweiterungen, zuletzt das größte Feature Reporting).

---

## P4 — `usePartnerAccess` um granulare Permissions erweitern
**Problem:** Hook liefert nur `isPartnerAdmin` / `isPartnerMember`. Die DB-Spalten `can_manage_sales_catalog`, `can_create_tenant`, `can_view_billing`, `can_use_sales_scout` (+ Funktion `partner_member_can`) existieren bereits, werden aber im UI nirgends gelesen → entweder „alles oder nichts".

**Fix:**
- `src/hooks/usePartnerAccess.tsx`: Select um die vier `can_*`-Spalten erweitern. State zusätzlich exposed:
  ```ts
  permissions: {
    manageSalesCatalog: boolean;
    createTenant: boolean;
    viewBilling: boolean;
    useSalesScout: boolean;
  }
  ```
  `partner_admin` ⇒ alle `true` (Fallback wie heute).
- Konsumenten anpassen:
  - `PartnerSalesCatalog` / `PartnerSalesRules`: `canManage = permissions.manageSalesCatalog`.
  - `PartnerBilling`: Sichtbarkeit der Seite an `permissions.viewBilling` koppeln (Route-Guard + Sidebar-Hide).
  - `PartnerTenants`: Button „Tenant anlegen" an `permissions.createTenant`.
  - Sales-Scout-Einträge (falls in Partner-Nav) an `permissions.useSalesScout`.
- Sidebar `PartnerLayout`: Items conditionally rendern.

---

## P5 — `PartnerBilling.saveSale` hinter Server-Guard
**Problem:** Frontend versteckt den Save-Button nur via `disabled={!isPartnerAdmin}` — ein manipulierter Request kann jeden Verkaufspreis ändern. RLS auf `partner_module_prices` (o.ä.) prüft den Rolle/Permission-Status nicht zwingend.

**Fix:**
- RLS-Policy der Preis-Tabelle so verschärfen, dass `INSERT`/`UPDATE` nur erlaubt ist, wenn `partner_member_can(auth.uid(),'view_billing')` **und** Mitglied des passenden `partner_id`. (Migration; vorher Tabellenname verifizieren — vermutlich `partner_module_prices` oder `partner_sales_prices`.)
- Frontend: `saveSale.mutate` zusätzlich an `permissions.viewBilling` koppeln (statt nur `isPartnerAdmin`).

---

## P1 — White-Label-Settings-Seite im Partner-Portal
**Problem:** White-Label-Felder (`logo_url`, `primary_color`, `secondary_color`, `accent_color`, `brand_display_name`, `support_email`, `custom_domain`, `subdomain`, `white_label_enabled`) liegen in `partners`, sind aber heute nur über Super-Admin pflegbar. Partner-Admin hat keinen Self-Service.

**Fix:**
- Neue Seite `src/pages/partner/PartnerBranding.tsx` (Route `/partner/branding`, in Sidebar nur für `isPartnerAdmin`).
- Felder als Form (react-hook-form + zod): Display-Name, Support-Email, drei Color-Pickers (HSL-Tokens), Logo-Upload (`partner-assets`-Bucket), Read-only: `custom_domain`/`subdomain`/`white_label_enabled` (mit Hinweis „bitte Super-Admin kontaktieren, um Domain freizuschalten").
- Migration: RLS auf `partners` UPDATE für den eigenen Datensatz erlauben — Spalten-Whitelist via Trigger (`partners_partner_admin_update_guard`), der bei Änderung von `white_label_enabled`/`custom_domain`/`subdomain`/`commission_*`/`billing_*` durch Nicht-Super-Admins ein `RAISE EXCEPTION` wirft.
- Storage-Policy `partner_assets_super_admin_write|update|delete` um Partner-Admin erweitern, scoped auf Pfadprefix `<partner_id>/`.
- Live-Preview-Komponente: Header-Bar mit Logo + Farben rendern.

---

## P3 — `PartnerTenants` Detail- & Edit-View
**Problem:** Tenant-Liste zeigt nur Stammdaten; kein Drilldown auf Standorte, Lizenzen, Module, Statusverlauf. Bearbeitung (Name, Kontakt, Notizen, Modul-Zuweisung) fehlt komplett.

**Fix:**
- Neue Route `/partner/tenants/:tenantId` → `PartnerTenantDetail.tsx`.
  - Tabs: **Übersicht** (Stammdaten, Status, Lifecycle aus Welle 2 read-only sichtbar), **Standorte** (Liste), **Module/Lizenzen** (aktive Module + Plan), **Aktivität** (letzte Logins, letzter Gateway-Heartbeat).
  - Edit-Dialog `PartnerTenantEditDialog`: Name, Kontaktdaten, Notiz, Sprache. Nur Felder, die der Partner verwalten darf (keine `status`/`tenant_id`/Billing-Felder).
- RLS-Check: `tenants` UPDATE für Partner-Admin nur auf eigene Tenants — über `tenant_partner_links` / `partners.id` + `partner_member_can('create_tenant')` (separate Policy via Trigger-Whitelist analog P1).
- `PartnerTenants.tsx`: Zeilen klickbar → Detail-Route. Bestehende Lifecycle-Buttons aus Welle 2 bleiben Super-Admin-only.

---

## P2 — Partner-Reporting & Analytics
**Problem:** Partner sehen weder Umsatz pro Tenant noch aktive Module, Wachstum, MRR oder Tenant-Health. Es existiert keine Reporting-Seite.

**Fix:**
- Neue Seite `src/pages/partner/PartnerReporting.tsx` (Route `/partner/reporting`, nur sichtbar mit `permissions.viewBilling`).
- KPI-Kacheln (alle scoped auf Partner via RLS / RPC):
  - Aktive Tenants, neue Tenants (30d), gesperrte/gelöschte Tenants
  - MRR (Summe `monthly_price` aller aktiven Lizenzen)
  - Provision/Marge (`commission_mode` aus `partners` + `partner_module_prices`)
  - Aktive Module pro Tenant (Top-Liste)
- Charts (recharts): Tenant-Wachstum 12 Monate, MRR-Verlauf 12 Monate, Modul-Verteilung (BarChart).
- Datenzugriff über drei RPCs (read-only, SECURITY DEFINER, Partner-Scope):
  - `partner_reporting_overview(_partner_id uuid)` → JSON KPIs
  - `partner_reporting_growth(_partner_id uuid)` → monatliche Tenant-/MRR-Zeitreihen
  - `partner_reporting_modules(_partner_id uuid)` → Modul-Aggregation
  Innerhalb der RPCs jeweils `is_partner_member(auth.uid(), _partner_id)`-Check.
- Export-Button: CSV-Download der KPI-Tabelle (jeden Wert via `toLocaleString("de-DE")`).
- Performance: `staleTime: 5 * 60_000` auf alle drei Queries.

---

## Cross-Cutting

- **i18n:** Alle neuen Strings in DE/EN/ES/NL (4-Sprachen-Regel).
- **Design:** AICONO CI (Blue/Teal/White), Capsule-Shapes, Montserrat/Inter, dunkle/helle Mode kompatibel. Status-Badges aus dem bestehenden Token-Set.
- **Zahlenformat:** `toLocaleString("de-DE")` für alle KPIs/Charts/Exports.
- **Sidebar:** `PartnerLayout` Items conditionally rendern nach P4-Permissions.
- **Tests:** Smoke je Seite (Render, RLS-Block für nicht-berechtigte Partner-Members), 1 Unit-Test pro neuer RPC.

## Verifikation pro Schritt
1. P4: Member ohne `view_billing` sieht `PartnerBilling` nicht; `partner_admin` weiterhin alles.
2. P5: Direct-Insert via SQL/curl als non-billing-Member → RLS lehnt ab.
3. P1: Partner-Admin ändert Logo & Farben → Tenant-User mit eigener Subdomain sieht das geänderte Branding nach Reload.
4. P3: Partner-Admin öffnet Tenant-Detail, ändert Name → erscheint in Super-Admin sofort. Cross-Partner-Zugriff per URL → RLS blockt.
5. P2: KPIs konsistent mit Super-Admin-Statistiken (gleiche Tenants/MRR-Summen, gefiltert auf Partner).

## Nicht enthalten
- Audit-Log (A4 — eigene Welle).
- Lexware-Integration für Partner-eigene Rechnungen (Roadmap).
- Multi-Tier-Partner (Partner-of-Partner) — nicht im Scope.
