# Projekt-Audit AICONO EMS — Lückenanalyse

Drei parallele Audits (Tenant + PWAs, Super-Admin + Partner, Backend + Infra) haben insgesamt **42 Findings** ergeben. Hier die priorisierte Übersicht. Die Umsetzung wird in **Wellen** vorgeschlagen, damit du je Welle einzeln entscheiden kannst.

---

## 🔴 Welle 1 — Sofortmaßnahmen (Sicherheit, kritisch)

Diese Punkte sind echte Sicherheitslücken in Production und sollten zuerst geschlossen werden.

| # | Bereich | Lücke | Vorschlag |
|---|---|---|---|
| S1 | Edge Function `charge-point-auto-reboot` | `verify_jwt=false` **und** keinerlei Auth-Check im Handler. Jeder kann öffentliche Wallboxen rebooten. | `x-cron-secret`-Header gegen Env-Var prüfen (timingSafeEqual). |
| S2 | Edge Function `gateway-ingest` GET-Routes | `list-locations` / `list-meters` / `get-readings` / `get-locations-summary` nutzen Service-Role **ohne Tenant-Scoping**. Jeder eingeloggte Nutzer sieht alle Tenants. | `validateApiKey()` auch in GET-Handlern erzwingen oder auf User-JWT-Client umstellen. |
| S3 | Partner-Portal `PartnerTenants` | „Remote-Support starten" ist **nicht** hinter `isPartnerAdmin`-Guard — `partner_user` kann sich als Tenant-Admin impersonieren. | Button & Handler hinter `isPartnerAdmin` setzen, zusätzlich serverseitig in `support-session-impersonate` Partner-Rolle prüfen. |
| S4 | Edge Function `support-session-impersonate` | Refresh-Token wird ausgegeben und bei Session-Ende **nicht** widerrufen → dauerhafter Zugriff trotz 15-Min-TTL. | Bei `support-session-end`: `auth.admin.signOut(supportUserId, 'global')`. Refresh-Token nicht an Client zurückgeben. |
| S5 | Sales-PWA (`SalesProjects`, `SalesProjectDetail`) | Queries auf `sales_projects` **ohne** Tenant-/User-Filter im Frontend (verlässt sich allein auf RLS — RLS-Status unklar). | `.eq("created_by", user.id)` + Tenant-Filter ergänzen, RLS-Policy verifizieren. |
| S6 | Storage-Buckets `floor-plans` / `floor-3d-models` | Per Migration `public=true`, keine Pfad-RLS → Grundrisse aller Liegenschaften ohne Login abrufbar (physisches Sicherheitsrisiko). | Buckets wieder auf `public=false`, Tenant-/Location-Pfad-Policy einführen. |
| S7 | RLS `node_metrics` | Policy erlaubt `SELECT` für **alle** Authenticated → Infra-Daten (CPU/RAM/Hostnames) für jeden Tenant einsehbar. | Policy auf `has_role(auth.uid(),'super_admin')` einschränken. |

---

## 🟠 Welle 2 — Auth & Lifecycle (hoch)

| # | Bereich | Lücke | Vorschlag |
|---|---|---|---|
| A1 | Master-Recovery / `must_change_password` | Flag wird gesetzt, aber **nie** enforced → SA kann beliebig oft mit Initial-PW einloggen. | Auth-Hook-Edge-Function oder strenger Router-Guard, der auf `/set-password` zwingt und Logout bei Bypass-Versuch erzwingt. |
| A2 | Super-Admin Tenant-Lifecycle | Kein UI zum Sperren / Reaktivieren / Archivieren / Löschen eines Tenants. `is_active` existiert in DB, aber kein Button. | Danger-Zone-Card in `SuperAdminTenantDetail` mit AlertDialog-geschützten Actions. |
| A3 | Lizenz-Verwaltung (`SuperAdminLicenses`) | Read-only — keine Möglichkeit, Lizenzen anzulegen, zu verlängern oder zu kündigen. | Edit-Dialog mit `plan`, `price_per_month`, `billing_cycle`, `status`. |
| A4 | Audit-Log fehlt **systemweit** | Keine Tabelle, kein UI. Admin-Aktionen (Modul-Toggle, Tenant-Sperre, Preisänderung, Member-Removal) sind nicht nachvollziehbar. | Neue Tabelle `audit_logs` + Edge-Function `audit-log-write`, Aufruf in allen kritischen `onSuccess`-Callbacks. Tab „Aktivitätslog" in Tenant- und Partner-Detail. |
| A5 | `SuperAdminUsers` | Kein Tenant-Filter & kein Tenant-Spalten-Anzeige → SA kann User nicht nach Tenant zuordnen. | Join auf `tenants(name)`, Filter-Dropdown ergänzen. |

---

## 🟡 Welle 3 — Partner-Portal Ausbau (mittel)

Das Partner-Portal hinkt funktional dem Super-Admin spürbar hinterher.

| # | Lücke | Vorschlag |
|---|---|---|
| P1 | Keine White-Label-Settings-Seite (`/partner/settings`) — Partner-Admin kann Logo, Farben, Display-Name nicht selbst pflegen. | Neue Page mit Tabs „Branding" + „Domain". |
| P2 | Kein Reporting/Analytics (MRR-Verlauf, Modul-Adoption, kumulierter Verbrauch). | Neue Page `/partner/reporting` mit MRR-LineChart und Modul-PieChart. |
| P3 | `PartnerTenants` ohne Detail-/Edit-View — Partner-Admin kann Tenant nur anlegen, nicht bearbeiten. | Route `/partner/tenants/:id` mit Edit-Dialog (mind. Name, Kontakt-Email, Modul-Toggle). |
| P4 | `usePartnerAccess` hat nur Boolean `isPartnerAdmin` — granulare Permissions (`partner_member_can()` existiert in DB!) werden im UI ignoriert. | Hook auf `can(permission)` umstellen, alle Guards umstellen. |
| P5 | Sicherheits-Lücke in `PartnerBilling`: `saveSale` ohne `isPartnerAdmin`-Guard im UI. | `disabled={!isPartnerAdmin}` + Server-Guard. |

---

## 🟢 Welle 4 — Tenant-UX & Konsistenz (mittel)

| # | Lücke | Vorschlag |
|---|---|---|
| U1 | `NetworkInfrastructure` zeigt **ausschließlich Dummy-Daten** — keine DB-Anbindung, kein Demo-Badge. | Echte `integrations`-Daten anbinden oder Seite als Beta markieren. |
| U2 | `TenantElectricity` formatiert Beträge mit `.toFixed(2)` statt `de-DE` → `1234.56 €` statt `1.234,56 €` (Core-Regel verletzt). | Konsequent `formatNumber()`-Helper. |
| U3 | `Automation.tsx` `CATEGORY_CONFIG`-Labels hardcoded Deutsch → kein i18n. | Konfiguration in Funktion `getCategoryConfig(t)` umbauen. |
| U4 | `EnergyData`/`EnergyReport`: kein CSV/Excel-Export. | Export-Button mit `@e965/xlsx`. |
| U5 | `ChargingBilling`: keine PDF-Download-Funktion (im Gegensatz zu `SharingInvoices`). | Signed-URL-Download analog `SharingInvoices`. |
| U6 | `Tasks`: keine Bulk-Actions (Status, Delete). | Checkbox-Spalte + Action-Bar. |
| U7 | Globale Silent-Fails: `SalesProjects`, `SalesProjectDetail`, `ChargingAppAdmin`, `SharingInvoices` zeigen bei Query-Fehler leere UI ohne Toast/Hinweis. | Einheitliches Error-Pattern (Toast + Retry-Button). |
| U8 | `EnergySharingMemberDetail`: „Vertrag nicht unterzeichnet" ohne CTA. | Direktlink zum SignContractDialog + „Erinnerung senden"-Action. |

---

## ⚙️ Welle 5 — Backend-Härtung & Performance (mittel)

| # | Lücke | Vorschlag |
|---|---|---|
| B1 | `ingest-node-metrics`: Wildcard-CORS, kein Rate-Limit, einfacher String-Compare auf Token. | `getCorsHeaders()` nutzen, `timingSafeEqual`, simples DB-Rate-Limit. |
| B2 | `community-marketplace-public`: nur E-Mail-basiertes Rate-Limit, IP wird geloggt aber nicht enforced. | Zusätzliches IP-Rate-Limit (10/h). |
| B3 | Kein Retention-Cron für `node_metrics` (30 Tage). | `cleanup-node-metrics-daily` (analog zum 06.06.-Fix). |
| B4 | Fehlende Crons: `ppa-alert-check`, `aggregate-pv-actual-hourly`. | Cron-Schedules ergänzen. |
| B5 | Fehlender Index `meter_power_readings(tenant_id, recorded_at DESC)` → Full-Table-Scans bei Multi-Tenant. | Index anlegen. |
| B6 | Realtime-Publication fehlt für `meter_power_readings_5min`. | `ALTER PUBLICATION supabase_realtime ADD TABLE`. |
| B7 | Default-`staleTime` fehlt — ~82 % der Hooks refetchen sofort bei Tab-Wechsel (Dashboard erzeugt dutzende parallele Requests). | Globalen `QueryClient`-Default auf `30_000` setzen, Live-Daten explizit überschreiben. |
| B8 | `Copilot`-KI-Analysen ohne `staleTime` → teure AI-Calls bei jedem Render. | `staleTime: Infinity` für abgeschlossene Analysen. |

---

## 🔵 Welle 6 — Super-Admin Komfort (niedrig)

| # | Lücke | Vorschlag |
|---|---|---|
| X1 | `SuperAdminMap`-Route existiert, fehlt aber in Sidebar-Navigation. | Eintrag in `SuperAdminSidebar` ergänzen. |
| X2 | `SuperAdminPartners`-Edit-Dialog zeigt nur Basisfelder, keine White-Label-/Billing-Felder. | Edit-Dialog um Tabs „Billing" + „Branding" erweitern. |
| X3 | `SuperAdminBilling`: Lexware-Status nicht als Spalte; partielle Fehler werden nicht gequeued. | Spalte „Lexware-Status" + Retry-Button. |
| X4 | `SuperAdminMonitoring`: keine konfigurierbaren Alert-Schwellwerte. | Neue Tabelle `monitoring_alert_rules` + UI-Card. |
| X5 | `SuperAdminStatistics`: nur 3 KPIs + 1 Chart, kein MRR-Verlauf, keine Modul-Adoption. | Historische `platform_metrics`-Tabelle + LineChart/PieChart. |

---

## Empfehlung Reihenfolge

1. **Welle 1 (S1–S7)** — heute, da Production-Sicherheitslücken
2. **Welle 2 (A1–A5)** — innerhalb 1 Woche, da Compliance/Lifecycle
3. **Welle 5 (B1–B8)** — parallel als reine DB-/Edge-Arbeit (geringes UI-Risiko)
4. **Welle 3 (P1–P5)** — Partner-Portal-Sprint
5. **Welle 4 (U1–U8)** — UX-Sprint
6. **Welle 6 (X1–X5)** — Komfort, kann gesammelt erledigt werden

**Bitte sag mir, mit welcher Welle ich starten soll** (oder ob du einzelne Punkte vorziehen / weglassen möchtest). Ich würde empfehlen, **Welle 1 komplett** als erstes umzusetzen — die Punkte sind klein, gefährlich und in einem Aufwasch erledigbar.
