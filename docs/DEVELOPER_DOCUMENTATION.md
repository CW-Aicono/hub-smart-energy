# SmartHub Energy – Developer Documentation

> **Stand:** Februar 2026 | **Stack:** React 18 · Vite · TypeScript · Tailwind CSS · Lovable Cloud (Supabase)

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Architektur](#2-architektur)
3. [Multi-Tenancy System](#3-multi-tenancy-system)
4. [Authentifizierung & Rollen](#4-authentifizierung--rollen)
5. [Modul-System (Feature Flags)](#5-modul-system-feature-flags)
6. [Gateway-Integrations-System](#6-gateway-integrations-system)
7. [OCPP / Ladeinfrastruktur-System](#7-ocpp--ladeinfrastruktur-system)
8. [BrightHub API-Integration](#8-brighthub-api-integration)
9. [Internationalisierung (i18n)](#9-internationalisierung-i18n)
10. [Datenfluss & State-Management](#10-datenfluss--state-management)
11. [Kernmodule](#11-kernmodule)
12. [Branding & Theming](#12-branding--theming)
13. [PWA-Konfiguration](#13-pwa-konfiguration)
14. [Edge Functions Übersicht](#14-edge-functions-übersicht)
15. [Datenbank-Schema](#15-datenbank-schema)
16. [Secrets & Umgebungsvariablen](#16-secrets--umgebungsvariablen)
17. [Entwicklungsworkflow](#17-entwicklungsworkflow)
18. [Wichtige Patterns & Konventionen](#18-wichtige-patterns--konventionen)
19. [Bekannte Besonderheiten & Fallstricke](#19-bekannte-besonderheiten--fallstricke)

---

## 1. Projektübersicht

**SmartHub Energy** ist ein Multi-Tenant B2B Energie-Dashboard für Kommunen und KMU. Es ermöglicht:
- Zentrales Energiemonitoring über mehrere Standorte
- Integration von Gebäudeautomationssystemen (Loxone, Shelly, ABB, etc.)
- Verwaltung von Ladeinfrastruktur (OCPP 1.6)
- Automatisierungsregeln auf Standortebene
- Export/Sync zu externen Energieplattformen (BrightHub)

**Deployment-URLs:**
- Preview: `https://id-preview--1e1d0ab0-a25d-49ac-9d3a-662f96a9ba12.lovable.app`
- Live (Produktion): `https://hub-smart-energy.lovable.app`
- EV Charging App: `/ev` (separate PWA mit eigenem Manifest)
- Mobile Scan-App: `/m`

**Technologie-Stack:**

| Schicht | Technologie |
|---|---|
| Frontend-Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State Management | TanStack Query v5 (React Query) |
| Routing | React Router v6 |
| Backend / DB | Lovable Cloud (Supabase) |
| Edge Functions | Deno (TypeScript) |
| 3D-Visualisierung | Three.js via @react-three/fiber |
| Karten | Leaflet via react-leaflet |
| Charts | Recharts |
| PWA | vite-plugin-pwa (Workbox) |

---

## 2. Architektur

### 2.1 Frontend-Architektur

**Provider-Hierarchie** (`src/App.tsx`):

```
QueryClientProvider          ← TanStack Query Cache
  └─ AuthProvider            ← Supabase Auth Session
       └─ TenantProvider     ← Tenant-Daten + Branding-CSS
            └─ TranslationProvider  ← i18n (de/en/es/nl)
                 └─ ThemeProvider   ← Dark/Light Mode (next-themes)
                      └─ TooltipProvider
                           └─ BrowserRouter
                                └─ Routes
```

**Routing-Struktur** (`src/App.tsx`):
- Alle geschützten Routen sind mit `<ModuleGuard>` (`<M>`) oder `<SuperAdminWrapper>` (`<SA>`) umhüllt
- Öffentliche Routen: `/auth`, `/accept-invite`, `/set-password`, `/ev`, `/m`, `/getting-started`
- Super-Admin-Bereich: `/super-admin/*` (eigene Sidebar, eigene Übersetzungen)

```tsx
// Kurzformen in App.tsx:
const M = ({ children }) => <ModuleGuard>{children}</ModuleGuard>;
const SA = ({ children }) => <SuperAdminWrapper>{children}</SuperAdminWrapper>;

// Beispiel-Route:
<Route path="/integrations" element={<M><Integrations /></M>} />
```

### 2.2 Backend-Architektur

Das Backend läuft vollständig auf Lovable Cloud (Supabase):

```
Browser (React)
  │
  ├─ supabase.from("table")  ← Direkte DB-Abfragen via RLS-Policy
  │
  └─ supabase.functions.invoke("fn")  ← Edge Functions (Deno)
       │
       └─ Externe APIs (Loxone, Shelly, BrightHub, etc.)
```

**Datenbankzugriff:** Alle Abfragen gehen über den Supabase JS Client. Row-Level Security stellt sicher, dass jeder Mandant nur seine eigenen Daten sieht.

**Edge Functions:** 23 Funktionen in `supabase/functions/`. Jede Funktion:
1. Verarbeitet `OPTIONS`-Requests (CORS Preflight)
2. Verwendet `SUPABASE_SERVICE_ROLE_KEY` für privilegierten Datenbankzugriff
3. Gibt JSON mit `{ success: boolean, data?: ..., error?: ... }` zurück

---

## 3. Multi-Tenancy System

### 3.1 Datenbankebene

Jeder Mandant (Tenant) hat eine eigene Zeile in der `tenants`-Tabelle. **Alle mandantenspezifischen Tabellen** enthalten eine `tenant_id UUID`-Spalte.

Die zentrale DB-Funktion für RLS:

```sql
-- Gibt die tenant_id des aktuell angemeldeten Benutzers zurück
get_user_tenant_id() → UUID

-- Typische RLS-Policy:
CREATE POLICY "tenant_isolation" ON public.meters
  FOR ALL USING (tenant_id = get_user_tenant_id());
```

Die Funktion liest die `tenant_id` aus der `profiles`-Tabelle (nicht direkt aus `auth.users`).

### 3.2 Frontend: `useTenant` Hook

```ts
// src/hooks/useTenant.tsx
const { tenant, loading, error, refetch, updateBranding } = useTenant();

// Tenant-Objekt:
interface Tenant {
  id: string;
  name: string;
  slug: string;
  branding: { primary_color: string; secondary_color: string; accent_color: string; font_family: string; };
  logo_url: string | null;
  week_start_day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  // ...
}
```

**Branding-Anwendung:** `TenantProvider` konvertiert Hex-Farben in HSL und setzt CSS-Custom-Properties direkt auf `<html>`:

```ts
function applyBrandingToCSS(branding: TenantBranding) {
  root.style.setProperty('--primary', hexToHSL(branding.primary_color));
  root.style.setProperty('--accent', hexToHSL(branding.accent_color));
  root.style.setProperty('--sidebar-primary', hexToHSL(branding.secondary_color));
}
```

### 3.3 `useTenantQuery` Helper

Zentraler Query-Builder, der automatisch `tenant_id` in alle Abfragen injiziert:

```ts
// src/hooks/useTenantQuery.ts
const { from, insert, tenantId, ready } = useTenantQuery();

// SELECT – tenant_id wird automatisch gefiltert:
const { data } = await from("meters").select("*").order("name");

// INSERT – tenant_id wird automatisch hinzugefügt:
await insert("meters", { name: "Hauptzähler", location_id: "...", ... });
```

**Wichtig:** `from()` gibt einen Supabase QueryBuilder zurück (mit `.eq("tenant_id", tenantId)` vorbelegt). Alle weiteren Filter können normal angehängt werden.

### 3.4 `profiles`-Tabelle

Brücke zwischen `auth.users` und dem Tenant-System:

```
auth.users (id)  →  profiles (user_id, tenant_id, role)  →  tenants (id)
```

- Nie `auth.users` direkt abfragen – immer über `profiles`
- Rollen werden in `profiles.role` gespeichert (nicht in `auth.users.raw_user_meta_data`)

---

## 4. Authentifizierung & Rollen

### 4.1 Auth-Flow

```ts
// src/hooks/useAuth.tsx
const { user, session, loading, signIn, signUp, signOut } = useAuth();
```

- Basiert auf `supabase.auth.onAuthStateChange` – reagiert automatisch auf Token-Refresh
- `signUp` setzt `emailRedirectTo: window.location.origin + "/"` (E-Mail-Verifizierung)
- Kein Anonymous Sign-Up

### 4.2 App-Rollen

```ts
type AppRole = "admin" | "user" | "super_admin";
const { role, isAdmin, loading } = useUserRole();
```

Die Rolle wird über die `ensure_at_least_one_admin()` RPC-Funktion ermittelt. Diese:
1. Stellt sicher, dass mindestens ein Admin existiert (der erste Benutzer wird automatisch Admin)
2. Gibt die aktuelle Rolle des Users zurück
3. Legt fehlende `user_roles`-Einträge an

### 4.3 Einladungs-Flow (Invite)

```
Admin → /admin → InviteUserDialog
  → Edge Function: invite-tenant-admin
    → Erstellt user in auth.users (temporäres Passwort)
    → Erstellt profiles-Eintrag (tenant_id, role)
    → Speichert Token in invite_tokens-Tabelle
    → Edge Function: send-invitation-email
      → Resend API → E-Mail mit Link zu /accept-invite?token=...
```

Wenn der Benutzer auf den Link klickt:
```
/accept-invite?token=... → AcceptInvite.tsx
  → Edge Function: activate-invited-user
    → Validiert Token, markiert als verwendet
    → Benutzer kann Passwort setzen via /set-password
```

### 4.4 Super-Admin-Bereich

- Route: `/super-admin/*`
- Schutz: `<SuperAdminWrapper>` prüft `role === "super_admin"` und leitet sonst um
- Eigene Sidebar: `src/components/super-admin/SuperAdminSidebar.tsx`
- Eigene Übersetzungen: `src/i18n/superAdminTranslations.ts` + `useSATranslation` Hook
- Super-Admins sehen **alle** Mandanten (keine tenant_id-Filterung in speziellen Queries)

---

## 5. Modul-System (Feature Flags)

### 5.1 Verfügbare Module

```ts
// src/hooks/useTenantModules.tsx
export const ALL_MODULES = [
  { code: "dashboard",           label: "Dashboard",                     alwaysOn: true },
  { code: "locations",           label: "Standortverwaltung" },
  { code: "integrations",        label: "Integrationen" },
  { code: "floor_plans",         label: "Grundrisse" },
  { code: "energy_monitoring",   label: "Energiemonitoring" },
  { code: "reporting",           label: "Berichte" },
  { code: "automation_building", label: "Automation (Gebäudeebene)" },
  { code: "automation_multi",    label: "Multi-Location Automation" },
  { code: "ev_charging",         label: "Ladeinfrastruktur" },
  { code: "alerts",              label: "Alarmregeln" },
  { code: "meter_scanning",      label: "Zähler-Scanning (OCR)" },
  { code: "live_values",         label: "Live-Sensorwerte" },
  { code: "network_infra",       label: "Netzwerkinfrastruktur" },
  { code: "brighthub_api",       label: "BrightHub API" },
  { code: "arbitrage_trading",  label: "Arbitragehandel" },
];
```

Module werden in `tenant_modules` (DB-Tabelle) je Mandant gespeichert.

### 5.2 Route- und Nav-Schutz

```ts
// src/hooks/useModuleGuard.tsx
const { isRouteAllowed, isNavItemVisible, isModuleEnabled } = useModuleGuard();

// Route → Modul-Mapping:
const ROUTE_MODULE_MAP = {
  "/integrations":      "integrations",
  "/energy-data":       "energy_monitoring",
  "/meters":            "energy_monitoring",
  "/live-values":       "live_values",
  "/charging/points":   "ev_charging",
  "/charging/billing":  "ev_charging",
  "/automation":        "automation_multi",
  "/network":           "network_infra",
  "/settings/branding": "integrations",
};
```

`<ModuleGuard>` prüft bei jedem Routing-Event ob das Ziel-Modul aktiviert ist. Bei fehlendem Modul → 404-Seite.

### 5.3 Super-Admin: Module verwalten

Im Super-Admin-Panel (`/super-admin/tenants/:id`) können Module per Toggle aktiviert/deaktiviert werden. Die Preise dafür sind in `module_prices` hinterlegt.

---

## 6. Gateway-Integrations-System

### 6.1 Architektur (Plugin-basiert)

Die Gateway-Integrationen sind als Plugin-System in `src/lib/gatewayRegistry.ts` definiert. Jede Integration hat:

```ts
interface GatewayDefinition {
  type: string;            // z.B. "loxone_miniserver"
  label: string;           // Anzeigename
  icon: string;            // Lucide Icon
  description: string;
  edgeFunctionName: string; // z.B. "loxone-api"
  configFields: GatewayConfigField[]; // Dynamische UI-Felder
}
```

### 6.2 Unterstützte Gateways

| Gateway | Typ | Edge Function | Authentifizierung |
|---|---|---|---|
| Loxone Miniserver | `loxone_miniserver` | `loxone-api` | Serial + User/PW (Cloud DNS) |
| Shelly Cloud | `shelly_cloud` | `shelly-api` | Auth Key |
| ABB free@home | `abb_free_at_home` | `abb-api` | OAuth2 (Client Credentials) |
| Siemens Building X | `siemens_building_x` | `siemens-api` | OAuth2 (Client Credentials) |
| Tuya Smart | `tuya_cloud` | `tuya-api` | Access ID + Secret (HMAC-SHA256) |
| Homematic IP | `homematic_ip` | `homematic-api` | SGTIN + Auth Token |
| TP-Link Omada | `omada_cloud` | `omada-api` | OAuth2 (Client Credentials) |

Konfigurationsfelder werden aus dem Registry dynamisch gerendert – kein gatewayspezifischer Code in UI-Komponenten.

### 6.3 Datenspeicherung

```
integrations (type, config JSON)          ← Mandantenebene
  └─ location_integrations (integration_id, location_id, config, last_sync_at)
       └─ meter_power_readings (meter_id, power_value, recorded_at)
```

Die `config` in `location_integrations` enthält die credentials (serialisiertes JSON, RLS-geschützt).

### 6.4 Periodische Synchronisierung (Cron-Jobs)

**Nicht-Loxone Gateways** – `gateway-periodic-sync` Edge Function:
- Wird von `pg_cron` alle 5 Minuten aufgerufen
- Iteriert alle `location_integrations` mit `is_enabled = true`
- Dispatcht `getSensors`-Action an die jeweilige Gateway-Edge-Function
- Schreibt Werte in `meter_power_readings`

**Loxone** – `loxone-periodic-sync` Edge Function:
- Separater Cron (alle 5 Min) wegen Batch-Optimierung
- Verarbeitet max. **20 Loxone-Integrationen parallel** (um Timeout zu vermeiden)
- Loxone-API-Calls werden über Cloud DNS proxied

### 6.5 Verbindungstest in der UI

Beim Klick auf „Verbindung testen" in `EditIntegrationDialog`:
1. Pflichtfelder werden validiert (aus `configFields.required`)
2. Edge Function wird direkt aufgerufen (`action: "test"`)
3. Response bestimmt Erfolgs-/Fehlermeldung im Toast

---

## 7. OCPP / Ladeinfrastruktur-System

### 7.1 Gesamtarchitektur

```
Ladepunkt (OCPP-Hardware)
  │ WebSocket ws://...ocpp-ws-proxy/{ocpp_id}
  ▼
ocpp-ws-proxy (Edge Function)     ← Zustandsloses WebSocket-Gateway
  │ Parsed + logged → ocpp_message_log
  │ Polling pending_ocpp_commands (alle 3s)
  ▼
ocpp-central (Edge Function)      ← Business Logic
  │ StopTransaction → charging_sessions
  │ MeterValues    → meter_power_readings
  ▼
Database (Supabase)
```

### 7.2 OCPP 1.6 Nachrichtenformat

```json
// CALL (Anfrage, vom Ladepunkt oder Backend):
[2, "unique-message-id", "MessageType", { ...payload }]

// CALLRESULT (Antwort auf CALL):
[3, "unique-message-id", { ...responsePayload }]

// CALLERROR:
[4, "unique-message-id", "ErrorCode", "ErrorDescription", {}]
```

### 7.3 Wichtige Datenbanktabellen

| Tabelle | Zweck |
|---|---|
| `charge_points` | Registrierte Ladepunkte (status, ocpp_id, location_id) |
| `charging_sessions` | Ladevorgang-Protokoll (start/stop, kWh, id_tag) |
| `ocpp_message_log` | Vollständiges OCPP-Protokoll (in/out, raw JSON) |
| `pending_ocpp_commands` | Befehlswarteschlange (RemoteStart/Stop, Reset) |
| `charge_point_groups` | Gruppierung von Ladepunkten (Zugangs- + Energieeinstellungen) |
| `charging_users` | Benutzer mit RFID-Tag oder App-Tag |
| `charging_tariffs` | Preismodelle (€/kWh, Grundgebühr, Standgebühr) |
| `charging_invoices` | Abrechnungsbelege |

### 7.4 Remote-Befehle (Command Queue)

```ts
// Beispiel: RemoteStartTransaction auslösen
await supabase.from("pending_ocpp_commands").insert({
  charge_point_id: cp.id,
  command: "RemoteStartTransaction",
  payload: { connector_id: 1, id_tag: user.app_tag },
  tenant_id: tenantId,
});
// ocpp-ws-proxy pollt alle 3s und sendet den Befehl an den Ladepunkt
```

### 7.5 RFID & App-Tag Autorisierung

- **RFID-Tag:** Direkt in `charging_users.rfid_tag` gespeichert
- **App-Tag:** Wird per DB-Trigger `generate_app_tag()` automatisch generiert (Format: `APP{8 Zufallszeichen}`, max. 20 Zeichen – OCPP-kompatibel)
- Altes Format `APP:{uuid}` wird aus Abwärtskompatibilitätsgründen weiterhin akzeptiert
- `RemoteStartTransaction` wird auch im Status `unavailable`/`Preparing` akzeptiert

---

## 8. BrightHub API-Integration

BrightHub ist eine externe Energieplattform. Die Synchronisierung erfolgt über `supabase/functions/brighthub-sync/index.ts`.

### 8.1 Actions

| Action | Datenquelle | Ziel-Endpoint | Beschreibung |
|---|---|---|---|
| `sync_meters` | `meters`-Tabelle | `sync_meters` | Zähler-Stammdaten synchronisieren |
| `sync_readings` | `meter_readings` | `bulk_readings` | Manuelle Zählerlesungen (kWh, kumulativ) |
| `sync_intraday` | `meter_power_readings` | `bulk_intraday` | Live-Leistungswerte (kW, 5-min-Intervall) |

### 8.2 Sync-Logik

```
brighthub_settings (tenant_id, location_id, api_key, last_reading_sync_at, last_intraday_sync_at)
  │
  ├─ sync_readings: Liest meter_readings WHERE reading_date > last_reading_sync_at
  │   → Chunks von max. 1.000 Einträgen → bulk_readings
  │
  └─ sync_intraday: Liest meter_power_readings WHERE recorded_at > last_intraday_sync_at
      → Chunks von max. 5.000 Einträgen → bulk_intraday
```

**Energietyp-Mapping:** `electricity/strom → "electricity"`, `fernwärme/district_heating → "district_heating"`, etc.

**Einheiten-Mapping:** Erlaubte Einheiten: `kWh, MWh, m³, Liter, GJ`. Alles andere wird gemappt.

### 8.3 Konfiguration

In `brighthub_settings` je Mandant + Standort:
- `api_key` – BrightHub API-Schlüssel
- `webhook_url` / `webhook_secret` – Für eingehende Daten (noch nicht implementiert)
- `auto_sync_readings` – Automatische Synchronisierung aktiviert

---

## 9. Internationalisierung (i18n)

### 9.1 Sprachen & Struktur

Unterstützte Sprachen: **DE** (Standard), **EN**, **ES**, **NL**

```ts
// src/i18n/translations.ts (~3200 Zeilen)
type Language = "de" | "en" | "es" | "nl";
type TranslationKey = "common.save" | "meter.add" | ...; // Union aus allen Keys

const translations: Record<TranslationKey, Record<Language, string>> = {
  "common.save": { de: "Speichern", en: "Save", es: "Guardar", nl: "Opslaan" },
  // ...
};
```

### 9.2 Verwendung in Komponenten

```tsx
// In React-Komponenten:
import { useTranslation } from "@/hooks/useTranslation";
const { t, language } = useTranslation();
return <button>{t("common.save")}</button>;
```

### 9.3 Verwendung außerhalb von Komponenten

```ts
// In Mutations, Edge-Function-Callbacks, etc.:
import { getT } from "@/i18n/getT";
const t = getT(); // Liest Sprache aus localStorage
toast({ title: t("meter.saved") });
```

`getT()` liest die Sprachpräferenz aus `localStorage` ("user_preferences" Key, gleicher Key wie `useUserPreferences`).

### 9.4 Super-Admin-Übersetzungen

```ts
// src/i18n/superAdminTranslations.ts
import { useSATranslation } from "@/hooks/useSATranslation";
const { t } = useSATranslation();
```

Separates Übersetzungs-Dictionary für den Super-Admin-Bereich (kleineres Subset).

### 9.5 Fehlende Übersetzung

Bei fehlendem Key gibt `t()` den Key-String zurück und loggt eine Warnung in der Konsole. Fallback ist immer Deutsch (`translation.de`).

---

## 10. Datenfluss & State-Management

### 10.1 TanStack Query (React Query v5)

Primärer Cache-Layer für alle Serverdaten.

**Namenskonvention für Query-Keys:**
```ts
// Format: [ressource, scope?, id?]
["meters", tenantId]                    // Alle Zähler des Mandanten
["meter-readings", meterId]             // Lesungen eines Zählers
["tenant-modules", tenantId]            // Module eines Mandanten
["charge-points", tenantId]             // Alle Ladepunkte
["ocpp-logs", chargePointId]            // Logs eines Ladepunkts
```

**Standard-Pattern für alle datenbanknahen Hooks:**
```ts
// READ
const { data, isLoading, error } = useQuery({
  queryKey: ["meters", tenantId],
  enabled: !!tenantId,
  queryFn: async () => {
    const { data, error } = await from("meters").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

// WRITE
const mutation = useMutation({
  mutationFn: async (payload) => { /* supabase insert/update/delete */ },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["meters", tenantId] });
    toast({ title: t("meter.saved") });
  },
  onError: (e: Error) => {
    toast({ title: t("common.error"), description: e.message, variant: "destructive" });
  },
});
```

### 10.2 Realtime-Subscriptions

Für Echtzeit-Updates (z.B. Ladepunkt-Status):

```ts
useEffect(() => {
  const channel = supabase
    .channel("charge-points-changes")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "charge_points",
      filter: `tenant_id=eq.${tenantId}`,
    }, (payload) => {
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [tenantId]);
```

### 10.3 Lokaler State

- Einfacher UI-State (Dialoge offen/zu, Formulare): `useState`
- Komplexere Formulare: `react-hook-form` + `zod`-Validation
- Dashboard-Layout: `react-grid-layout` (Drag & Drop)
- Kein Redux, kein Zustand, kein Context für App-Daten (alles via React Query)

---

## 11. Kernmodule

### 11.1 Dashboard

- **Widgets:** In `dashboard_widgets` (DB) pro User gespeichert
- **Widget-Typen:** `energy_chart`, `cost_overview`, `alerts_list`, `pie_chart`, `sankey`, `weather`, `floor_plan`, `location_map`, `sustainability_kpis`, `forecast`, `anomaly`
- **Anpassung:** Drag & Drop via `react-grid-layout`, Modal `DashboardCustomizer`
- **Standort-Filter:** `useDashboardFilter` Hook, Auswahl in `LocationFilter`-Komponente

### 11.2 Energiedaten (`/energy-data`)

- Datenquellen: `meter_readings` (manuell/OCR), `meter_power_readings` (Gateway-Live), `energy_readings` (aggregiert per Standort)
- Hook: `useEnergyData(locationId, startDate, endDate, energyType)`
- Export: `src/lib/exportUtils.ts` (CSV, PDF-Bericht)
- Geplante Berichte: `report_schedules`-Tabelle + `send-scheduled-report` Edge Function

### 11.3 Standorte (`/locations`, `/locations/:id`)

- **Hierarchie:** `locations.parent_id → locations.id` (beliebig tief)
- **Typen:** `building`, `floor`, `room`, `outdoor`, `campus`
- **3D-Viewer:** `FloorPlan3DViewer.tsx` via Three.js, OBJ/MTL-Import
- **Raum-Editor:** `RoomEditor.tsx` – Polygon-basierter 2D-Editor (`RoomPolygonEditor.tsx`)
- **Energiequellen:** `locations.energy_sources[]` (Array von Strings)
- **Karte:** Leaflet-Karte in `LocationsMap.tsx` und `LocationsMapContent.tsx`

### 11.4 Messstellen / Zähler (`/meters`)

- **Zähler-Hierarchie:** `meters.parent_meter_id → meters.id`
- **Zählertypen (capture_type):** `manual` (Ablesung), `gateway` (Live), `virtual` (Formel), `ocr` (Kamera)
- **Virtuelle Zähler:** Formel-Builder `VirtualMeterFormulaBuilder.tsx` – erlaubt Summen/Differenzen aus anderen Zählern
- **Aggregation:** `MeterAggregationWidget.tsx` zeigt aggregierte Werte eines Teilbaums
- **Gas-Konvertierung:** `brennwert` + `zustandszahl` für Umrechnung m³ → kWh

### 11.5 Live-Werte (`/live-values`)

- Hook: `useLiveSensorValues.ts` – pollt alle verbundenen Gateways
- Hook: `useLoxoneSensors.ts` – Loxone-spezifische Sensor-Abfrage
- Anzeige: Echtzeit-Tabelle mit Sortierung/Filterung nach Raum/Typ

### 11.6 Automation (`/automation`)

- Tabelle: `location_automations`
- **Conditions:** JSONB-Array `[{ sensor_uuid, operator, value, unit }]`
- **Logic:** `AND` oder `OR`
- **Actions:** JSONB-Array `[{ actuator_uuid, control_type, value }]`
- **Schedule:** Optional – JSONB `{ type: "daily", time: "06:00", days: [1,2,3,4,5] }`
- UI: `AutomationRuleBuilder.tsx`

### 11.7 Aufgaben / Tasks (`/tasks`)

- Tabelle: `tasks`
- **Prioritäten:** `low`, `medium`, `high`, `critical`
- **Status:** `open`, `in_progress`, `done`
- Kanban-ähnliche Ansicht in `Tasks.tsx`
- Detail-Drawer: `TaskDetailSheet.tsx`

### 11.8 Netzwerkinfrastruktur (`/network`)

- Integration: TP-Link Omada via `omada-api` Edge Function
- Anzeige: Geräte-Tabelle (`NetworkDevicesTable.tsx`), Übersicht (`NetworkOverview.tsx`)
- Daten: Live-Polling (kein persistenter Cache)

### 11.9 Alert-Regeln

- Tabelle: `alert_rules`
- Konfiguration: `threshold_type` (`above`/`below`), `threshold_value`, `time_unit`, `energy_type`
- Benachrichtigung: `notification_email`
- Anzeige: `AlertsList.tsx` im Dashboard

---

## 12. Branding & Theming

### 12.1 CSS-Custom-Properties

Alle Farben werden als HSL-Werte in CSS-Custom-Properties definiert (`src/index.css`):

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --sidebar-primary: 221.2 83.2% 53.3%;
  /* ... */
}
```

**Kritisch:** Nie direkte Farb-Tailwind-Klassen in Komponenten (`text-blue-500`, `bg-red-600`). Immer semantische Token verwenden (`text-primary`, `bg-background`).

### 12.2 Tenant-Branding

`TenantProvider` überschreibt beim Laden die CSS-Variablen `--primary`, `--accent`, `--sidebar-primary` mit den Branding-Farben des Mandanten. Dies geschieht sofort beim App-Start.

### 12.3 Dark/Light Mode

```ts
// src/hooks/useTheme.tsx – wraps next-themes
const { theme, setTheme } = useTheme(); // "light" | "dark" | "system"
```

Dark-Mode-Varianten sind in `index.css` unter `.dark { ... }` definiert.

---

## 13. PWA-Konfiguration

### 13.1 Vite PWA Plugin

```ts
// vite.config.ts
VitePWA({
  registerType: "autoUpdate",
  manifest: false, // Eigenes manifest.json in public/ wird verwendet
  workbox: {
    navigateFallbackDenylist: [/^\/~oauth/],  // OAuth-Flows nicht cachen
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,  // Max 3MB pro Asset
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    runtimeCaching: [
      // CacheFirst für Google Fonts (1 Jahr TTL)
    ],
  },
})
```

### 13.2 Manifests

| Datei | Scope | App-Name |
|---|---|---|
| `public/manifest.json` | Haupt-App (`/`) | SmartHub Energy |
| `public/manifest-ev.json` | EV Charging App (`/ev`) | SmartHub EV |

### 13.3 Update-Banner

`src/components/UpdateBanner.tsx` – Zeigt Banner wenn neuer Service Worker verfügbar ist.

```ts
// src/hooks/useUpdateCheck.tsx
// Pollt Service Worker Registration und setzt needsUpdate-Flag
const { needsUpdate, updateApp } = useUpdateCheck();
```

---

## 14. Edge Functions Übersicht

Alle Edge Functions liegen unter `supabase/functions/`. Alle verwenden Deno-Runtime.

| Function | Trigger | Zweck |
|---|---|---|
| `loxone-api` | HTTP POST | Loxone Miniserver → Sensordaten abfragen |
| `loxone-periodic-sync` | pg_cron (5 min) | Alle Loxone-Integrationen synchronisieren (Batch 20) |
| `shelly-api` | HTTP POST | Shelly Cloud → Gerätedaten |
| `abb-api` | HTTP POST | ABB free@home → Sensordaten |
| `siemens-api` | HTTP POST | Siemens Building X → Datenpunkte |
| `tuya-api` | HTTP POST | Tuya IoT Cloud → Gerätedaten |
| `homematic-api` | HTTP POST | Homematic IP → Sensordaten |
| `omada-api` | HTTP POST | TP-Link Omada → Netzwerkgeräte |
| `gateway-periodic-sync` | pg_cron (5 min) | Alle Nicht-Loxone-Gateways synchronisieren |
| `ocpp-ws-proxy` | WebSocket | OCPP 1.6 WebSocket-Gateway für Ladepunkte |
| `ocpp-central` | HTTP POST | OCPP Business Logic (StartTransaction, MeterValues, etc.) |
| `brighthub-sync` | HTTP POST | BrightHub-Plattform synchronisieren (Zähler, Messwerte, Leistung) |
| `brighthub-periodic-sync` | pg_cron | Automatische BrightHub-Synchronisierung |
| `invite-tenant-admin` | HTTP POST | Neuen Tenant-Admin einladen (User anlegen) |
| `activate-invited-user` | HTTP POST | Einladungs-Token validieren + User aktivieren |
| `send-invitation-email` | HTTP POST | Einladungs-E-Mail via Resend API versenden |
| `delete-user` | HTTP POST | User aus auth.users + profiles löschen |
| `send-scheduled-report` | pg_cron | Geplante Berichte per E-Mail versenden |
| `send-charging-invoices` | HTTP POST | Ladeabrechnungen per E-Mail versenden |
| `meter-ocr` | HTTP POST | Zählerstand per OCR aus Foto erkennen |
| `anomaly-detection` | pg_cron | Anomalie-Erkennung in Energiedaten |
| `weather-degree-days` | HTTP POST | Heizgradtage für Wetternormalisierung berechnen |
| `openchargemap` | HTTP POST | Öffentliche Ladepunkte von OpenChargeMap abrufen |
| `fetch-spot-prices` | pg_cron (1h) | Day-Ahead-Spotpreise (EPEX Spot DE-LU) abrufen |
| `gateway-ingest` | HTTP POST | Messwerte vom Gateway Worker entgegennehmen |

**Authentifizierung:** Die meisten Functions haben `verify_jwt = false` (in `supabase/config.toml`), da sie entweder von pg_cron oder von der App ohne User-JWT aufgerufen werden. Sie verwenden intern den `SUPABASE_SERVICE_ROLE_KEY`.

---

## 15. Datenbank-Schema

### 15.1 Kern-Tabellen

```
tenants                      – Mandanten (Unternehmen)
  ├─ profiles                – Benutzerprofile (user_id → auth.users)
  ├─ user_roles              – Rollen (admin/user/super_admin)
  ├─ tenant_modules          – Aktivierte Feature-Module
  ├─ locations               – Standorte (hierarchisch via parent_id)
  │    ├─ floors             – Stockwerke (floor_plan_url, model_3d_url)
  │    │    ├─ floor_rooms   – Räume (Polygon-Koordinaten als JSON)
  │    │    └─ floor_sensor_positions  – Sensor-Positionen in 3D
  │    ├─ meters             – Energiezähler
  │    │    ├─ meter_readings        – Manuelle Ablesungen
  │    │    ├─ meter_power_readings  – Live-Leistungswerte (kW)
  │    │    └─ meter_period_totals   – Aggregierte Perioden-Totale
  │    ├─ location_integrations      – Gateway-Verbindungen
  │    ├─ location_automations       – Automatisierungsregeln
  │    ├─ alert_rules                – Alarmregeln
  │    └─ energy_prices              – Energiepreise (gültig von/bis)
  ├─ integrations            – Globale Gateway-Konfigurationen
  ├─ charge_points           – Ladepunkte
  ├─ charge_point_groups     – Ladepunkt-Gruppen
  ├─ charging_sessions       – Ladevorgang-Protokoll
  ├─ charging_users          – Benutzer mit RFID/App-Tag
  ├─ charging_tariffs        – Preismodelle
  ├─ charging_invoices       – Abrechnungsbelege
  ├─ tasks                   – Aufgaben
  ├─ custom_roles            – Benutzerdefinierte Rollen
  ├─ email_templates         – E-Mail-Vorlagen
  ├─ brighthub_settings      – BrightHub-Konfiguration
  └─ dashboard_widgets       – Widget-Konfiguration (per User)
  ├─ energy_storages         – Batteriespeicher (Kapazität, Leistung, Wirkungsgrad)
  ├─ arbitrage_strategies    – Handelsstrategien (Schwellenwerte)
  ├─ arbitrage_trades        – Trade-Historie (Erlöse)
  └─ spot_prices             – Stündliche Day-Ahead-Spotpreise
```

### 15.2 System-Tabellen (kein Tenant-Scope)

```
invite_tokens          – Einladungs-Token (expires_at)
charger_models         – Ladegerät-Modelle (globale Referenz)
module_prices          – Modul-Preise (Super-Admin)
ocpp_message_log       – OCPP-Protokoll
pending_ocpp_commands  – OCPP-Befehlswarteschlange
permissions            – Berechtigungen (für custom_roles)
```

### 15.3 RLS-Muster

```sql
-- Standard-Pattern für Tenant-isolierte Tabellen:
CREATE POLICY "tenant_access" ON public.meters
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

-- Super-Admin sieht alles (in manchen Tabellen):
CREATE POLICY "super_admin_access" ON public.tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
```

---

## 16. Secrets & Umgebungsvariablen

### 16.1 Frontend (Vite / `.env`)

> **Nie manuell bearbeiten** – wird automatisch von Lovable Cloud generiert.

| Variable | Verwendung |
|---|---|
| `VITE_SUPABASE_URL` | Supabase-Projekt-URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon Key (öffentlich, sicher in Browser) |
| `VITE_SUPABASE_PROJECT_ID` | Projekt-ID |

### 16.2 Edge Functions (Server-Secrets)

| Secret | Verwendung |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Privilegierter DB-Zugriff in Edge Functions (automatisch verfügbar) |
| `SUPABASE_URL` | DB-URL in Edge Functions (automatisch verfügbar) |
| `RESEND_API_KEY` | E-Mail-Versand (Einladungen, Berichte) |
| `OPENCHARGEMAP_API_KEY` | Öffentliche Ladepunkt-Daten |

Secrets werden im Lovable Cloud Backend-Panel verwaltet und stehen in Edge Functions als `Deno.env.get("SECRET_NAME")` zur Verfügung.

---

## 17. Entwicklungsworkflow

### 17.1 Lokale Entwicklung

```bash
npm install
npm run dev          # Startet Vite Dev-Server auf Port 8080
npm run build        # Produktions-Build
npm run test         # Vitest Unit-Tests
```

### 17.2 Projektstruktur

```
src/
  components/        # Wiederverwendbare UI-Komponenten
    ui/              # shadcn/ui Basiskomponenten (nie direkt editieren)
    dashboard/       # Dashboard-Widgets
    locations/       # Standort-Komponenten
    charging/        # Ladeinfrastruktur
    integrations/    # Gateway-Integrationen
    admin/           # User-Management
    super-admin/     # Super-Admin-Bereich
  pages/             # Route-Komponenten (1:1 mit Routen)
  hooks/             # Custom React Hooks
  i18n/              # Übersetzungen
  lib/               # Utilities (keine React-Abhängigkeiten)
  integrations/
    supabase/
      client.ts      # ← NICHT EDITIEREN (auto-generiert)
      types.ts       # ← NICHT EDITIEREN (auto-generiert)
supabase/
  functions/         # Edge Functions (Deno)
  migrations/        # SQL-Migrationen (YYYYMMDDHHMMSS_uuid.sql)
docs/                # Projektdokumentation
public/              # Statische Assets, Manifests
```

### 17.3 TypeScript-Aliase

```ts
// tsconfig.app.json
"@/*" → "./src/*"

// Verwendung:
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
```

### 17.4 Datenbankmigrationen

Alle Schemaänderungen über das Migrations-Tool (Lovable Cloud). Format:
```
supabase/migrations/20240118143022_<beschreibender-name>.sql
```

> **Kritisch:** Migrationen sind permanent und können nicht automatisch rückgängig gemacht werden. Live-Umgebung vor destruktiven Änderungen prüfen.

### 17.5 Supabase-Typen

`src/integrations/supabase/types.ts` wird automatisch aus dem DB-Schema generiert. Nach jeder Migration wird diese Datei aktualisiert. **Nie manuell editieren.**

---

## 18. Wichtige Patterns & Konventionen

### 18.1 Datenbankzugriff

```ts
// ✅ Richtig: useTenantQuery für tenant-scoped Abfragen
const { from, insert } = useTenantQuery();
const meters = await from("meters").select("*");

// ✅ Richtig: Direkt für nicht-tenant-scoped Abfragen
const { data } = await supabase.from("charger_models").select("*");

// ❌ Falsch: Manuelle tenant_id-Injektion
const { data } = await supabase.from("meters").eq("tenant_id", tenantId);
```

### 18.2 Toast-Feedback

Jede Mutation MUSS Toast-Feedback haben:
```ts
onSuccess: () => { toast({ title: t("meter.saved") }); },
onError: (e: Error) => { toast({ title: t("common.error"), description: e.message, variant: "destructive" }); },
```

### 18.3 Edge Functions

Minimales Template:
```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // ... Logik
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### 18.4 Farben / Styling

```tsx
// ✅ Richtig: Semantische Design-Tokens
<div className="bg-background text-foreground border-border">
<Button variant="default">  // verwendet --primary

// ❌ Falsch: Direkte Farb-Klassen
<div className="bg-white text-gray-900 border-gray-200">
```

### 18.5 React Hook Rules bei Gateways

Da Gateways dynamisch sind, nie bedingte `useQuery`-Aufrufe:
```ts
// ✅ Richtig: useQueries für dynamische Anzahl
const results = useQueries({
  queries: integrations.map(int => ({
    queryKey: ["gateway-data", int.id],
    queryFn: () => fetchGatewayData(int),
  })),
});

// ❌ Falsch: Bedingter useQuery
if (integration) { useQuery(...) } // React Hook Rules Verletzung
```

---

## 19. Bekannte Besonderheiten & Fallstricke

### 19.1 Auto-generierte Dateien – NIE editieren

| Datei | Grund |
|---|---|
| `src/integrations/supabase/types.ts` | Auto-generiert aus DB-Schema |
| `src/integrations/supabase/client.ts` | Auto-konfiguriert von Lovable Cloud |
| `.env` | Auto-generiert (Supabase-Credentials) |
| `supabase/config.toml` | Auto-konfiguriert |

### 19.2 Loxone-spezifische Grenzen

- **Batch-Größe:** Max. 20 Loxone-Integrationen werden parallel in `loxone-periodic-sync` verarbeitet
- **Cloud DNS:** Loxone-API-Aufrufe gehen über den Loxone Cloud DNS Proxy (nicht direkt zur Hardware)
- **Separater Cron:** Loxone hat einen eigenen Cron-Job, da die Latenz höher ist als bei Cloud-APIs

### 19.3 BrightHub Sync-Unterschied

| Action | Datenquelle | Wann |
|---|---|---|
| `sync_readings` | `meter_readings` (kWh, kumulativ, manuell) | Bei Bedarf oder Cron |
| `sync_intraday` | `meter_power_readings` (kW, Live, Gateway) | Automatisch alle ~5 Min |

### 19.4 OCPP App-Tag Format

OCPP 1.6 erlaubt max. 20 Zeichen für `idTag`. Das generierte Format `APP{8chars}` = 11 Zeichen. Das alte Format `APP:{36chars UUID}` = 40 Zeichen und würde bei echter Hardware fehlschlagen. Trotzdem wird es in `ocpp-central` für Abwärtskompatibilität unterstützt.

### 19.5 Supabase Query-Limit

Standard-Limit: **1.000 Zeilen** pro Query. Bei großen Datensätzen (Messwerte, OCPP-Logs) explizites `.limit()` oder Pagination verwenden. Fehlende Daten können auf dieses Limit zurückzuführen sein.

### 19.6 `profiles`-Tabelle statt `auth.users`

Nie `supabase.from("auth.users")` abfragen – das ist ein reserviertes Schema und nicht via Client-SDK zugänglich. User-Informationen immer über `profiles` lesen.

### 19.7 Tenant-Loading-Timing

`useTenantQuery()` gibt eine No-Op-Version zurück solange `ready === false`. Queries die auf `enabled: ready` angewiesen sind, müssen diesen Lifecycle beachten:

```ts
const { ready, from } = useTenantQuery();
useQuery({
  queryKey: ["meters", tenantId],
  enabled: ready,  // ← Wichtig! Nicht vergessen.
  queryFn: ...
});
```

### 19.8 Migrationen und Live-Umgebung

Destructive Migrations (Spalten löschen, Tabellen umbenennen) müssen zuerst in der Live-Umgebung auf bestehende Daten geprüft werden. Bei vorhandenen Daten: Erst Datenmigration via SQL (Live), dann Schemaänderung deployen.

---

## 20. Arbitragehandel-Modul

### 20.1 Überblick

Das Arbitragehandel-Modul ermöglicht die wirtschaftliche Optimierung von Batteriespeichern durch Nutzung von Day-Ahead-Spotpreisen (EPEX Spot DE-LU).

### 20.2 Datenbanktabellen

| Tabelle | Zweck |
|---|---|
| `spot_prices` | Stündliche Day-Ahead-Spotpreise (€/MWh, Marktgebiet, Zeitstempel) |
| `energy_storages` | Batteriespeicher (Kapazität, Lade-/Entladeleistung, Wirkungsgrad) |
| `arbitrage_strategies` | Handelsstrategien (Kauf-/Verkaufsschwellen, aktiv/inaktiv) |
| `arbitrage_trades` | Ausgeführte Trades (Typ, Energie, Preis, Erlös) |

### 20.3 Edge Function: `fetch-spot-prices`

- **Trigger:** pg_cron (stündlich, `0 * * * *`)
- **Datenquelle:** `api.energy-charts.info/price?bzn=DE-LU` (Day-Ahead EPEX Spot)
- **Logik:** Lädt Preise für heute und morgen (falls verfügbar), upsert in `spot_prices`
- **Deduplication:** Upsert via `ON CONFLICT (market_area, timestamp)`

### 20.4 Frontend-Hooks

```ts
// src/hooks/useSpotPrices.tsx
const { prices, currentPrice, isLoading } = useSpotPrices(marketArea, hours);
// refetchInterval: 5 Minuten – automatische Aktualisierung im Browser

// src/hooks/useEnergyStorages.tsx
const { storages, createStorage, deleteStorage } = useEnergyStorages();

// src/hooks/useArbitrageStrategies.tsx
const { strategies, createStrategy, updateStrategy, deleteStrategy } = useArbitrageStrategies();

// src/hooks/useArbitrageTrades.tsx
const { trades, totalRevenue, totalEnergy } = useArbitrageTrades();
```

### 20.5 Chart-Visualisierung

Der Spotpreis-Chart (`ArbitrageDashboard`) zeigt Preise ab `now - 12h`:
- **Vergangene Stunden:** Gestrichelte Linie (`strokeDasharray`), `muted-foreground`-Farbe
- **Zukünftige Stunden:** Durchgezogene Linie, `primary`-Farbe
- **X-Achse:** Zweizeilig (Uhrzeit + lokalisierter Wochentag/Datum), 3h-Intervalle auf vollen Stunden
- **Tagestrennlinien:** Vertikale `ReferenceLine` bei Datumswechsel
- **Lokalisierung:** `date-fns` Locales (`de`, `enUS`, `es`, `nl`) basierend auf User-Sprache

---

## 21. Echtzeit-Datenerfassung & Verdichtung

### 21.1 Live-Werte Pipeline

```
Gateway Worker (30s) → meter_power_readings (roh)
                           │
  pg_cron (00:05 UTC) ─────┘
                           ▼
               meter_power_readings_5min (aggregiert)
                           │
               Rohdaten > 24h alt → DELETE
```

### 21.2 Datenverdichtung (Cron: `compact-meter-power-readings-daily`)

- **Zeitplan:** Täglich 00:05 UTC
- **Logik:** Aggregiert Rohdaten älter als 24h in 5-Minuten-Buckets (`power_avg`, `power_max`, `sample_count`)
- **Deduplication:** Upsert via `ON CONFLICT (meter_id, energy_type, tenant_id, bucket)`
- **Cleanup:** Löscht Rohdaten nach erfolgreicher Verdichtung

### 21.3 Supabase Realtime für Live-Anzeige

Die Seite „Aktuelle Werte" (`/live-values`) nutzt Supabase Realtime Subscriptions auf `meter_power_readings` für Echtzeit-Updates mit < 1 Sekunde Latenz.

---

---

## 22. Gateway Worker – Industrietaugliches Echtzeit-Polling

### 20.1 Warum ein externer Worker?

Die bestehende Serverless-Architektur (Lovable Cloud Edge Functions + pg_cron) ermöglicht Polling-Intervalle von **mindestens 1 Minute** (pg_cron-Limit). Für industrielle Anwendungen mit Präzisionsanforderungen (<1 Minute) ist ein **dauerhaft laufender Prozess** erforderlich – ein sogenannter Gateway Worker.

> **Architekturprinzip:** Der Worker läuft vollständig unabhängig von der App. Die Datenbank (`meter_power_readings`) bleibt die einzige Schnittstelle. Die App zeigt die vom Worker geschriebenen Daten automatisch an – kein App-Umbau nötig.

```text
Gateway Worker (alle 30 Sek.)          App (unverändert)
      │                                      │
      │  HTTP → Loxone API                   │  Zeigt Daten
      │  HTTP → Shelly API                   │  aus meter_power_readings
      │  HTTP → ABB API ...                  │
      ▼                                      ▼
            ┌────────────────────────────┐
            │    meter_power_readings    │
            │    (Lovable Cloud DB)      │
            └────────────────────────────┘
```

### 20.2 Worker-Code

Der einsatzbereite Worker-Code liegt in `docs/gateway-worker/`:

| Datei | Beschreibung |
|---|---|
| `index.ts` | Haupt-Worker mit Polling-Logik für alle Gateway-Typen |
| `Dockerfile` | Multi-Stage Docker Build (Node.js 20 Alpine) |
| `package.json` | Abhängigkeiten (`@supabase/supabase-js`) |
| `tsconfig.json` | TypeScript-Konfiguration |

**Unterstützte Gateway-Typen:**

| Typ | Poller | Methode |
|---|---|---|
| `loxone` / `loxone_miniserver` | `pollLoxone()` | Cloud DNS → `/jdev/sps/io/{uuid}/all` |
| `shelly_cloud` | `pollShelly()` | Shelly Cloud API `/device/all_status` |
| `abb_free_at_home` | `pollABB()` | Local REST API |
| `siemens_building_x` | `pollSiemens()` | OAuth2 + REST API |
| `tuya_cloud` | Delegation | Edge Function (HMAC-Signing) |
| `homematic_ip` | `pollHomematic()` | CCU REST API |

### 20.3 Umgebungsvariablen

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `SUPABASE_URL` | URL der Lovable Cloud Datenbank | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-Role-Key (NIEMALS Anon-Key!) | ✅ |
| `POLL_INTERVAL_MS` | Polling-Intervall in ms (Standard: 30000) | ❌ |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | ❌ |

> ⚠️ **Sicherheit:** Der `SUPABASE_SERVICE_ROLE_KEY` darf **niemals** in den Code eingecheckt werden. Immer als Umgebungsvariable oder Docker Secret übergeben.

### 20.4 Lokales Testen

```bash
cd docs/gateway-worker
npm install
npm run build

# Mit echten Werten starten
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
POLL_INTERVAL_MS=10000 \
LOG_LEVEL=debug \
npm start
```

### 20.5 Deployment auf Railway (empfohlen)

Railway bietet das einfachste Deployment für dauerhafte Prozesse:

1. **Konto erstellen:** [railway.app](https://railway.app) → Anmelden mit GitHub
2. **Neues Projekt:** "Deploy from GitHub" → Repository auswählen
3. **Service konfigurieren:**
   - Root Directory: `docs/gateway-worker`
   - Build Command: `npm run build`
   - Start Command: `npm start`
4. **Umgebungsvariablen setzen** (Railway → Service → Variables):
   ```
   SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<Service-Role-Key aus Lovable Cloud>
   POLL_INTERVAL_MS=30000
   LOG_LEVEL=info
   ```
5. **Deploy** → Railway erstellt automatisch einen Container mit Restart-Policy

**Kosten:** ~5 USD/Monat für einen dauerhaft laufenden Service.

### 20.6 Deployment auf Fly.io

```bash
# Fly.io CLI installieren
curl -L https://fly.io/install.sh | sh

cd docs/gateway-worker

# App erstellen
fly launch --name gateway-worker-smarthub --no-deploy

# Secrets setzen
fly secrets set SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
fly secrets set POLL_INTERVAL_MS=30000

# Deployen
fly deploy
```

**Kosten:** ~3–5 USD/Monat (Shared CPU, 256 MB RAM).

### 20.7 Deployment auf einem eigenen Server (VPS/On-Premise)

Für maximale Kontrolle oder wenn ein Server bereits vorhanden ist:

```bash
# 1. Repository klonen oder Worker-Ordner kopieren
scp -r docs/gateway-worker user@server:/opt/gateway-worker

# 2. Auf dem Server: Build
cd /opt/gateway-worker
npm install && npm run build

# 3. Als systemd-Service einrichten
cat > /etc/systemd/system/gateway-worker.service << EOF
[Unit]
Description=SmartHub Gateway Worker
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/gateway-worker
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
Environment=SUPABASE_SERVICE_ROLE_KEY=eyJ...
Environment=POLL_INTERVAL_MS=30000
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
EOF

systemctl enable gateway-worker
systemctl start gateway-worker
systemctl status gateway-worker
```

### 20.8 Monitoring & Logs

```bash
# Railway
railway logs --tail

# Fly.io
fly logs --app gateway-worker-smarthub

# Systemd
journalctl -u gateway-worker -f

# Docker
docker logs -f gateway-worker
```

**Erwartete Log-Ausgabe bei Betrieb:**
```
[2026-02-19T14:32:00.000Z] [INFO] Gateway Worker starting...
[2026-02-19T14:32:00.000Z] [INFO]   Supabase URL: https://...supabase.co
[2026-02-19T14:32:00.000Z] [INFO]   Poll interval: 30000ms
[2026-02-19T14:32:00.100Z] [INFO] ── Poll cycle started ──────────────────────
[2026-02-19T14:32:00.110Z] [INFO] Found 12 active meters with gateway assignments
[2026-02-19T14:32:02.500Z] [INFO] ✓ Wrote 10 power readings
[2026-02-19T14:32:02.510Z] [INFO] ── Poll cycle done in 2410ms (10/12 readings) ──
```

### 20.9 Zusammenspiel mit Cron-Jobs

| Mechanismus | Intervall | Zweck |
|---|---|---|
| pg_cron `loxone-power-readings-sync` | 1 Minute | Fallback wenn Worker nicht läuft |
| pg_cron `gateway-power-readings-sync` | 1 Minute | Fallback für andere Gateways |
| **Gateway Worker** | **30 Sekunden** | **Industrietaugliche Echtzeit-Daten** |

Der Worker ergänzt die Cron-Jobs – er ersetzt sie nicht. Bei Ausfall des Workers übernehmen die Cron-Jobs automatisch (mit 1-Minuten-Auflösung als Fallback).

---

## 21. Infrastruktur-Monitoring

### 21.1 Eingebautes Monitoring (Super-Admin)

Die Plattform enthält ein integriertes Infrastruktur-Monitoring unter `/super-admin/monitoring`:

- **DB-Verbindungen**: Aktive vs. maximale Connections mit Zeitverlauf
- **Datenbankgröße**: Gesamtgröße und Top-10-Tabellen
- **Systemstatus**: Health-Checks für Datenbank, Auth und Storage
- **Applikationsmetriken**: Mandanten, Benutzer, Standorte, Zähler

Die Metriken werden durch die Edge Function `collect-metrics` gesammelt, die periodisch via pg_cron oder manuell aufgerufen werden kann.

**Tabelle:** `infrastructure_metrics` – automatische Retention nach 30 Tagen.

### 21.2 Prometheus + Grafana (Self-Hosting)

Für das Hetzner-Self-Hosting wird ein optionaler Prometheus/Grafana-Stack empfohlen:

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    environment:
      DATA_SOURCE_NAME: "postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/postgres?sslmode=disable"
    ports:
      - "9187:9187"
    depends_on:
      - db
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'supabase-api'
    metrics_path: /metrics
    static_configs:
      - targets: ['kong:8001']
```

**Empfohlene Grafana-Dashboards:**
- PostgreSQL Database (ID: 9628)
- Node Exporter Full (ID: 1860)

> **Hinweis:** Das eingebaute Monitoring-Dashboard deckt die Basis-Anforderungen ab. Für produktives Alerting (E-Mail, Slack, PagerDuty) wird der Grafana-Stack empfohlen.

---

*Dokumentation erstellt: Februar 2026 | Für Änderungen: Pull Request gegen `main`-Branch*
