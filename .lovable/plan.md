
# Entwickler-Dokumentation erstellen

## Wo wird die Dokumentation gespeichert?

Die Dokumentation wird als `docs/DEVELOPER_DOCUMENTATION.md` im Projektrepository angelegt. Sie ist damit:
- **Im Code-Editor** direkt einsehbar (Lovable Code View > docs/DEVELOPER_DOCUMENTATION.md)
- **Im GitHub-Repository** unter `docs/DEVELOPER_DOCUMENTATION.md` gerendert als Markdown
- **Dauerhaft im Projekt** versioniert und mit dem Code mitversioniert

---

## Umfang der Dokumentation

Die Dokumentation wird folgende Kapitel enthalten:

### 1. Projektübersicht
- Zweck: Multi-Tenant B2B Energie-Dashboard für Kommunen & KMU
- Technologie-Stack (React 18, Vite, TypeScript, Tailwind CSS, Supabase/Lovable Cloud)
- Deployment-URLs (Preview & Live)
- PWA-Konfiguration

### 2. Architektur

#### Frontend-Architektur
- Provider-Hierarchie in `App.tsx`: `QueryClientProvider > AuthProvider > TenantProvider > TranslationProvider > ThemeProvider`
- Routing-Konzept mit React Router v6
- `ModuleGuard` – Feature-Flag-basierter Routenschutz

#### Backend-Architektur (Lovable Cloud / Supabase)
- Datenbank-Schema: alle wichtigen Tabellen
- Row-Level Security (RLS): Muster für Tenant-Isolation
- Edge Functions: Übersicht aller 23 Funktionen mit Zweck
- Cron-basiertes Synchronisierungs-System

### 3. Multi-Tenancy System
- `useTenant` Hook: Tenant-Daten, Branding-Anwendung via CSS-Variablen
- `get_user_tenant_id()` DB-Funktion: Basis aller RLS-Policies
- `profiles`-Tabelle als Brücke zwischen `auth.users` und Tenants
- Tenant-Module-System (`ALL_MODULES`-Konstante, `useTenantModules`)

### 4. Authentifizierung & Rollen
- Drei App-Rollen: `user`, `admin`, `super_admin`
- `useUserRole` Hook mit `ensure_at_least_one_admin()` RPC
- `useModuleGuard` Hook: Routen- und Nav-Absicherung nach Modul-Codes
- Super-Admin-Bereich (`/super-admin/*`) mit `SuperAdminWrapper`
- Einladungs-Flow: Edge Functions `invite-tenant-admin`, `activate-invited-user`, `send-invitation-email`

### 5. Gateway-Integrations-System
- Plugin-Architektur via `gatewayRegistry.ts` (`GATEWAY_DEFINITIONS`)
- Unterstützte Gateways: Loxone Miniserver, Shelly Cloud, ABB free@home, Siemens Building X, Tuya, Homematic IP, TP-Link Omada
- Jede Gateway-Integration hat: `type`, `edgeFunctionName`, `configFields`
- `gateway-periodic-sync` Edge Function: Polling alle 5 Min über pg_cron
- `loxone-periodic-sync`: separates Handling wegen Batch-Optimierung (20 parallel)

### 6. OCPP / Ladeinfrastruktur-System
- Architektur: `ocpp-ws-proxy` (WebSocket-Gateway) → `ocpp-central` (Business Logic)
- OCPP 1.6 JSON Message Types: CALL(2), CALLRESULT(3), CALLERROR(4)
- Nachrichtenverfolgung: `ocpp_message_log`-Tabelle
- Remote-Befehle über `pending_ocpp_commands`-Tabelle (Poll-Intervall: 3s)
- Charge-Point-Gruppen: `charge_point_groups` + `useChargePointGroups` Hook
- RFID & App-Tag Autorisierung (`generate_app_tag()` DB-Trigger)

### 7. Internationalisierung (i18n)
- Sprachen: DE, EN, ES, NL
- `translations.ts` (~3200 Zeilen): alle UI-Strings
- `useTranslation` Hook: Zugriff via `t("key")`, Fallback zu Deutsch
- `useSATranslation`: separater Hook für Super-Admin-Bereich
- `getT()` Utility: Außerhalb von React-Komponenten (z.B. in Mutations)

### 8. Datenfluss & State-Management
- TanStack Query (React Query v5) als primärer Cache-Layer
- Namenskonvention für Query-Keys
- `useTenantQuery` Helper: Tenant-scoped Query Builder
- Realtime-Subscriptions (Supabase Postgres Changes) z.B. bei `charge_points`

### 9. Kernmodule
- **Dashboard**: Widget-System (`dashboard_widgets`), anpassbar per Drag & Drop
- **Energiedaten**: `useEnergyData`, manuelle Zählerlesungen + Live-Sensor-Werte aus Gateways
- **Standorte**: Hierarchisch (parent_id), 3D-Grundriss-Viewer (Three.js), Raum-Editor
- **Messstellen**: Zähler-Baum, virtuelle Zähler mit Formel-Builder
- **Automation**: `location_automations` mit Conditions/Actions in JSONB
- **Aufgaben (Tasks)**: `tasks`-Tabelle, Prioritäten (low/medium/high/critical), Kanban-artig
- **Netzwerk-Infrastruktur**: TP-Link Omada Integration
- **BrightHub API**: Externe Energieplattform-Anbindung (`brighthub-sync`)

### 10. Branding & Theming
- `TenantProvider` konvertiert Hex-Farben zu HSL und setzt CSS-Variablen auf `<html>`
- CSS-Variablen: `--primary`, `--accent`, `--sidebar-primary`
- Dark/Light Mode via `next-themes`

### 11. PWA-Konfiguration
- Workbox via `vite-plugin-pwa`
- Service Worker mit Cache-First für Fonts
- Manifests: `public/manifest.json` (Haupt-App) und `public/manifest-ev.json` (EV Charging App)
- `UpdateBanner`-Komponente: manueller PWA-Update-Check

### 12. Secrets & Umgebungsvariablen
- Vite-Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- Edge-Function-Secrets: `RESEND_API_KEY`, `OPENCHARGEMAP_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Hinweis: `.env` wird automatisch generiert – nie manuell bearbeiten

### 13. Entwicklungsworkflow
- Lokale Entwicklung: `npm run dev` auf Port 8080
- Alias `@` zeigt auf `./src`
- TypeScript-Pfade in `tsconfig.app.json`
- Supabase-Typen in `src/integrations/supabase/types.ts` (auto-generiert – nicht bearbeiten)
- Migrations-Konvention: `supabase/migrations/YYYYMMDDHHMMSS_<uuid>.sql`

### 14. Wichtige Patterns & Konventionen
- Alle datenbanknahen Hooks: `useQuery` + `useMutation` mit `queryClient.invalidateQueries`
- Toast-Feedback bei jeder Mutation (Erfolg & Fehler)
- Tenant-Isolation in allen Tabellen via `tenant_id = get_user_tenant_id()`
- Keine direkte Manipulation von `auth.users`; stattdessen `profiles`-Tabelle
- Edge Functions: immer `CORS headers` + `OPTIONS`-Handler

### 15. Bekannte Besonderheiten & Fallstricke
- `src/integrations/supabase/types.ts` und `client.ts` nie manuell editieren
- React Hook Rules bei dynamischen Gateway-Abfragen: `useQueries` statt bedingter `useQuery`
- Loxone: Batch-Größe max. 20, separater Cron-Sync
- BrightHub: `sync_readings` nutzt `meter_readings` (kWh), `sync_intraday` nutzt `meter_power_readings` (kW)

---

## Technische Umsetzung

Die Dokumentation wird als **eine einzige Markdown-Datei** (`docs/DEVELOPER_DOCUMENTATION.md`) angelegt. Sie enthält Code-Beispiele, Tabellen und Diagramme in ASCII/Markdown-Format.

**Umfang:** ca. 600–800 Zeilen strukturiertes Markdown
