# SmartHub Energy – Energiemanagement-Plattform

> Multi-Tenant B2B Energie-Dashboard für Kommunen und KMU

[![Stack](https://img.shields.io/badge/Stack-React_18_%7C_Vite_%7C_TypeScript-blue)]()
[![Backend](https://img.shields.io/badge/Backend-Supabase_(Edge_Functions)-green)]()
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Architektur](#architektur)
3. [Lokales Setup](#lokales-setup)
4. [Projektstruktur](#projektstruktur)
5. [Edge Functions](#edge-functions)
6. [Datenbank & Multi-Tenancy](#datenbank--multi-tenancy)
7. [Gateway-Worker (On-Premise)](#gateway-worker-on-premise)
8. [PWA-Multi-App](#pwa-multi-app)
9. [Deployment](#deployment)
10. [Secrets & Umgebungsvariablen](#secrets--umgebungsvariablen)
11. [Weiterführende Dokumentation](#weiterführende-dokumentation)

---

## Überblick

**SmartHub Energy** ist eine mandantenfähige Plattform für:

- 🏢 **Energiemonitoring** – Echtzeit-Überwachung über mehrere Standorte
- ⚡ **Ladeinfrastruktur** – OCPP 1.6 Ladepunkt-Management
- 🔌 **Gebäudeautomation** – Integration von Loxone, Shelly, ABB, Siemens, Tuya, Homematic, Omada
- 📊 **Reporting & Export** – Berichte, BrightHub-Sync, Spot-Preise
- 🤖 **Automatisierung** – Regelbasierte Steuerung auf Standortebene
- 🔋 **Arbitragehandel** – KI-gestützte Speicheroptimierung

### Technologie-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui |
| State | TanStack Query v5 · React Context |
| Routing | React Router v6 |
| Backend / DB | Supabase (PostgreSQL + RLS) |
| Edge Functions | Deno (TypeScript) |
| 3D / Karten / Charts | Three.js · Leaflet · Recharts |
| PWA | vite-plugin-pwa (Workbox) |
| On-Premise | Gateway Worker (Node.js / Docker) |

---

## Architektur

```
┌─────────────────────────────────────────────────┐
│  Browser (React SPA)                            │
│  ├─ supabase.from("table")   → DB via RLS      │
│  └─ supabase.functions.invoke("fn") → Edge Fn   │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Supabase                                        │
│  ├─ PostgreSQL (RLS-isoliert je Mandant)         │
│  ├─ Auth (E-Mail/Passwort, Invite-Flow)          │
│  ├─ Storage (Grundrisse, 3D-Modelle, Fotos)      │
│  ├─ Edge Functions (23 Funktionen, Deno)          │
│  └─ pg_cron (Periodische Sync alle 1-5 Min.)     │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Externe Systeme                                 │
│  ├─ Loxone Miniserver (Cloud DNS / WebSocket)    │
│  ├─ Shelly, ABB, Siemens, Tuya, Homematic, Omada│
│  ├─ BrightHub API                                │
│  ├─ OCPP 1.6 Ladepunkte (WebSocket)              │
│  ├─ Open-Meteo (Wetter), Energy-Charts (Spot)    │
│  └─ Resend (E-Mail-Versand)                      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Gateway Worker (Docker, On-Premise)             │
│  ├─ Läuft auf Raspberry Pi o.ä.                  │
│  ├─ Polling lokaler Hardware (z.B. Loxone WS)    │
│  └─ Sendet Daten an gateway-ingest Edge Function │
└─────────────────────────────────────────────────┘
```

### Provider-Hierarchie (App.tsx)

```
QueryClientProvider
  └─ AuthProvider            ← Supabase Auth Session
       └─ TenantProvider     ← Mandantendaten + CSS-Branding
            └─ TranslationProvider  ← i18n (de/en/es/nl)
                 └─ ThemeProvider   ← Dark/Light Mode
                      └─ BrowserRouter → Routes
```

---

## Lokales Setup

### Voraussetzungen

- Node.js ≥ 18 (empfohlen: via [nvm](https://github.com/nvm-sh/nvm))
- npm oder bun

### Installation

```bash
# Repository klonen
git clone <GIT_URL>
cd smart-energy-hub

# Abhängigkeiten installieren
npm install

# Dev-Server starten (Port 8080)
npm run dev
```

### Umgebungsvariablen

Die `.env`-Datei wird automatisch verwaltet und enthält:

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=<project-id>
```

> ⚠️ Die `.env`-Datei **nicht manuell bearbeiten** – sie wird automatisch generiert.

### Tests ausführen

```bash
npm run test        # Vitest (Unit-Tests)
```

---

## Projektstruktur

```
src/
├── components/
│   ├── ui/              # shadcn/ui Basis-Komponenten
│   ├── dashboard/       # Dashboard-Widgets (Sankey, Gauge, etc.)
│   ├── charging/        # Ladeinfrastruktur-UI
│   ├── locations/       # Standortverwaltung, 3D-Viewer
│   ├── integrations/    # Gateway-Konfiguration
│   ├── admin/           # Benutzerverwaltung
│   ├── settings/        # Branding, Profile, E-Mail-Templates
│   ├── super-admin/     # Plattform-Administration
│   └── layout/          # AppLayout, DemoLayout
├── hooks/
│   ├── useAuth.tsx       # Auth-Context + Provider
│   ├── useTenant.tsx     # Tenant-Context + Branding
│   ├── useTenantQuery.ts # Tenant-isolierte DB-Queries
│   ├── useTranslation.tsx # i18n
│   ├── useModuleGuard.tsx # Feature-Flag-Routing
│   └── use*.tsx          # Weitere Domain-Hooks
├── pages/               # Route-Komponenten
├── i18n/                # Übersetzungsdateien (de/en/es/nl)
├── lib/                 # Utilities (gatewayRegistry, formatEnergy, etc.)
├── integrations/supabase/
│   ├── client.ts        # ⚠️ Auto-generiert – nicht editieren
│   └── types.ts         # ⚠️ Auto-generiert – nicht editieren
├── data/                # Mock-Daten (Demo-Modus)
└── contexts/            # DemoMode-Context

supabase/
├── functions/           # 23 Edge Functions (Deno/TypeScript)
│   ├── _shared/         # Gemeinsame Utilities (CORS, Crypto)
│   └── <function-name>/ # Je eine index.ts pro Funktion
├── config.toml          # ⚠️ Auto-generiert – nicht editieren
└── migrations/          # DB-Migrationen (SQL)

docs/
├── DEVELOPER_DOCUMENTATION.md  # Ausführliche technische Referenz
├── gateway-worker/              # Gateway Worker Sourcecode + Docker
└── loxone-communicating-with-miniserver.pdf
```

---

## Edge Functions

Alle Edge Functions liegen in `supabase/functions/`. Jede Funktion:
- Verarbeitet CORS-Preflight (`OPTIONS`)
- Nutzt `SUPABASE_SERVICE_ROLE_KEY` für privilegierten Zugriff
- Gibt `{ success: boolean, data?, error? }` zurück

### Übersicht

| Funktion | Zweck |
|---|---|
| **Gateway-Integrationen** | |
| `loxone-api` | Loxone Miniserver Abfragen (Cloud DNS) |
| `loxone-periodic-sync` | Cron: Loxone-Sensoren synchronisieren |
| `shelly-api` | Shelly Cloud API |
| `abb-api` | ABB free@home (OAuth2) |
| `siemens-api` | Siemens Building X (OAuth2) |
| `tuya-api` | Tuya Cloud (HMAC-SHA256) |
| `homematic-api` | Homematic IP |
| `omada-api` | TP-Link Omada (OAuth2) |
| `gateway-periodic-sync` | Cron: Alle Non-Loxone-Gateways synchronisieren |
| `gateway-ingest` | Öffentliche API für Gateway Worker |
| **Ladeinfrastruktur (OCPP)** | |
| `ocpp-central` | OCPP 1.6 Business Logic |
| `ocpp-ws-proxy` | WebSocket-Proxy für Ladepunkte |
| `send-charging-invoices` | Ladeabrechnungen per E-Mail |
| **Benutzerverwaltung** | |
| `invite-tenant-admin` | Benutzer einladen |
| `activate-invited-user` | Einladung aktivieren |
| `send-invitation-email` | Einladungs-E-Mail (Resend) |
| `delete-user` | Benutzer löschen |
| **KI & Analyse** | |
| `anomaly-detection` | Anomalie-Erkennung (AI Gateway) |
| `arbitrage-ai-strategy` | KI-Speicheroptimierung |
| `meter-ocr` | Zählerstand-Erkennung (OCR via AI) |
| `pv-forecast` | PV-Ertragsprognose |
| **Externe Daten** | |
| `fetch-spot-prices` | Börsenstrompreise (Energy-Charts) |
| `weather-degree-days` | Gradtagzahlen (Open-Meteo) |
| `openchargemap` | Öffentliche Ladestationen |
| **BrightHub** | |
| `brighthub-sync` | Zähler/Messwerte synchronisieren |
| `brighthub-crypto` | API-Key-Verschlüsselung |
| `brighthub-periodic-sync` | Cron: Automatische Synchronisierung |

### Aufruf aus dem Frontend

```ts
import { supabase } from "@/integrations/supabase/client";

// Edge Function aufrufen:
const { data, error } = await supabase.functions.invoke("shelly-api", {
  body: { locationIntegrationId: "...", action: "getSensors" },
});
```

> ⚠️ **Niemals** Edge Functions über Pfade wie `/api/...` aufrufen. Immer `supabase.functions.invoke()` verwenden.

---

## Datenbank & Multi-Tenancy

### Tenant-Isolation

Jede mandantenspezifische Tabelle enthält `tenant_id UUID`. Row-Level Security (RLS) stellt die Isolation sicher:

```sql
-- Zentrale Funktion:
get_user_tenant_id() → UUID  -- Liest tenant_id aus profiles

-- Typische RLS-Policy:
CREATE POLICY "tenant_isolation" ON public.meters
  FOR ALL USING (tenant_id = get_user_tenant_id());
```

### Rollen-System

| Rolle | Rechte |
|---|---|
| `super_admin` | Plattform-Administration, alle Mandanten sichtbar |
| `admin` | Mandanten-Administration, Benutzerverwaltung |
| `user` | Lesen/Schreiben innerhalb zugewiesener Standorte |

### Wichtige Tabellen

| Tabelle | Beschreibung |
|---|---|
| `tenants` | Mandanten (Branding, Kontakt, Einstellungen) |
| `profiles` | User ↔ Tenant Zuordnung |
| `locations` | Standorte (hierarchisch via `parent_id`) |
| `meters` | Zähler (hierarchisch via `parent_meter_id`) |
| `meter_power_readings` | Live-Leistungswerte (kW) |
| `meter_period_totals` | Aggregierte Verbrauchsdaten (Tag/Woche/Monat) |
| `integrations` | Gateway-Definitionen je Mandant |
| `location_integrations` | Gateway ↔ Standort Zuordnung + Credentials |
| `charge_points` | OCPP-Ladepunkte |
| `charging_sessions` | Ladevorgänge |
| `tenant_modules` | Aktivierte Feature-Module je Mandant |

---

## Gateway-Worker (On-Premise)

Der Gateway Worker läuft als Docker-Container auf lokaler Hardware (z.B. Raspberry Pi) und überbrückt lokale Systeme (z.B. Loxone Miniserver im LAN) mit der Cloud.

### Setup

```bash
cd docs/gateway-worker

# Docker-Image bauen
docker build -t gateway-worker .

# Container starten
docker run -d --restart=always \
  -e SUPABASE_URL=https://<project-id>.supabase.co \
  -e GATEWAY_API_KEY=<dein-api-key> \
  -e POLL_INTERVAL_MS=30000 \
  gateway-worker
```

### API (gateway-ingest)

```bash
# Standorte abrufen
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  "$SUPABASE_URL/functions/v1/gateway-ingest?action=list-locations"

# Zähler abrufen
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  "$SUPABASE_URL/functions/v1/gateway-ingest?action=list-meters&location_id=<uuid>"

# Messwerte übermitteln (POST)
curl -X POST \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"readings": [{"meter_id": "...", "value": 42.5, "energy_type": "electricity"}]}' \
  "$SUPABASE_URL/functions/v1/gateway-ingest"
```

---

## PWA-Multi-App

Die Plattform unterstützt mehrere unabhängige PWA-Installationen auf einer Domain:

| App | Route | Manifest | Zweck |
|---|---|---|---|
| Energy Hub | `/` | `manifest.json` | Haupt-Dashboard |
| SmartCharge | `/ev` | `manifest-ev.json` | Lade-App (Endnutzer) |
| Mein Strom | `/te` | `manifest-te.json` | Mieter-Energieportal |
| Meter Mate | `/m` | `manifest.json` | Zählerstand-Scanner |

Manifeste werden dynamisch per JavaScript je nach aktiver Route geladen.

---

## Deployment

### Produktion (Lovable Cloud)

Die App wird über Lovable Cloud gehostet und deployed:

- **Frontend:** Über den Publish-Button im Editor deployen
- **Backend (Edge Functions):** Werden automatisch bei Code-Änderungen deployed
- **Datenbank-Migrationen:** Werden bei Publish automatisch angewendet

### Custom Domain

Aktuell konfigurierte Domain: `ems-pro.aicono.org`

### Self-Hosting (Docker Compose)

Für den Betrieb auf eigener Infrastruktur (z.B. Hetzner Cloud):

1. Supabase Self-Hosting Stack aufsetzen (~12 Container)
2. Frontend als Nginx-Container
3. Gateway Worker als separater Container
4. Empfohlene Hardware: 4 vCPU, 16 GB RAM

Details siehe `docs/DEVELOPER_DOCUMENTATION.md`, Abschnitt Self-Hosting.

---

## Secrets & Umgebungsvariablen

| Secret | Zweck |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Privilegierter DB-Zugriff in Edge Functions |
| `SUPABASE_URL` | Supabase-Projekt-URL |
| `GATEWAY_API_KEY` | Authentifizierung des Gateway Workers |
| `RESEND_API_KEY` | E-Mail-Versand (Einladungen, Rechnungen) |
| `LOVABLE_API_KEY` | AI Gateway (Anomalie, OCR, PV-Prognose) |
| `BRIGHTHUB_ENCRYPTION_KEY` | AES-Verschlüsselung der BrightHub API-Keys |
| `OPENCHARGEMAP_API_KEY` | Öffentliche Ladestationen-API |

> Secrets werden über die Lovable Cloud UI verwaltet und sind in allen Edge Functions als Umgebungsvariablen verfügbar.

---

## Weiterführende Dokumentation

| Dokument | Beschreibung |
|---|---|
| [`docs/DEVELOPER_DOCUMENTATION.md`](docs/DEVELOPER_DOCUMENTATION.md) | Ausführliche technische Referenz (1300+ Zeilen) |
| [`docs/gateway-worker/`](docs/gateway-worker/) | Gateway Worker Sourcecode, Dockerfile, Setup |
| [`docs/loxone-communicating-with-miniserver.pdf`](docs/loxone-communicating-with-miniserver.pdf) | Loxone Miniserver Kommunikationsprotokoll |

---

## Lizenz

Proprietär – © 2025-2026 SmartHub Energy. Alle Rechte vorbehalten.
