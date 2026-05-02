## Ziel
Öffentliche Status-Seite für alle Ladepunkte eines Tenants ohne Login, plus Button "Öffentlicher Link" auf der Ladepunkte-Seite.

## Konzept
Pro Tenant ein eindeutiger, zufälliger Slug-Token (z. B. `7f3a…`) erzeugt eine öffentliche URL:

```
https://ems-pro.aicono.org/public/charge-status/{token}
```

Der Token kann jederzeit aktiviert/deaktiviert/regeneriert werden. Ohne gültigen Token oder bei deaktiviertem Status: 404/Hinweis-Seite.

## Backend (Supabase Migration)

Neue Tabelle `public_charge_status_links`:
- `id uuid pk`
- `tenant_id uuid` (unique, FK auf tenants)
- `token text unique not null` (URL-safe, 32 Zeichen)
- `enabled boolean default true`
- `created_at`, `updated_at`

RLS:
- Authenticated: nur eigener Tenant (admin) kann row CRUD
- **Öffentlicher Lesezugriff über Edge Function** (kein anon SELECT auf der Tabelle nötig)

Neue Edge Function `public-charge-status` (verify_jwt = false):
- Input: `?token=…`
- Lookup `public_charge_status_links` per Service Role
- Wenn gefunden + enabled: liefert reduzierte Liste der `charge_points` (id, name, ocpp_id, status, connector_count, last_heartbeat, ws_connected) + `charge_point_connectors` (status pro Stecker) für den Tenant
- Tenant-Name + Logo-URL ebenfalls zurückgeben (für Header)
- Strenges CORS, kein Auth-Header nötig

## Frontend

### 1. Hook `useTenantPublicStatusLink`
- Query: aktueller Link für Tenant
- Mutations: `createOrEnable`, `disable`, `regenerateToken`

### 2. Dialog `PublicStatusLinkDialog.tsx` (neu, in `src/components/charging/`)
Nachgebaut nach Screenshot 2 (Monta-Style):
- Titel "Öffentlicher Link" + Status-Badge "Ein/Aus"
- Beschreibung "Jeder mit diesem Link kann den Status sehen"
- Read-only URL-Input + Copy-Button + Open-in-new-tab-Button
- Buttons: "Abbrechen" + "Öffentlichen Link aktivieren/deaktivieren"
- Bei Bedarf "Token neu generieren"

### 3. Button in `src/pages/ChargingPoints.tsx`
Neben "Ladepunkt hinzufügen" (nur wenn `isAdmin`):
```
[Öffentlicher Link]  [+ Ladepunkt hinzufügen]
```
Icon: `Globe` oder `Link2` aus lucide-react.

### 4. Neue Route + Public-Page
Route in `App.tsx` (ohne `M`/`SA`/`AuthProvider`-Schutz; AuthProvider läuft global, aber Seite nutzt keine `useAuth`-Pflicht):
```tsx
<Route path="/public/charge-status/:token" element={<PublicChargeStatus />} />
```

Neue Datei `src/pages/PublicChargeStatus.tsx`:
- Holt Daten via Edge Function (kein Supabase-Client mit Auth)
- Layout 1:1 nach Screenshot 1:
  - Header mit Tenant-Logo + Name links, Filter rechts, Status-Counter (Available, Charging, Disconnected, Faulted, Unavailable, Unconfigured) als kleine Pills
  - "Real-time" Pulsbadge
  - Grid mit Karten pro Ladepunkt:
    - Hintergrundfarbe nach Status (grün = Available, grau = Disconnected/Offline, blau = Charging, rot = Faulted)
    - Status-Icon + Label oben
    - Name in groß
    - `#OCPP-ID` in klein
  - Wenn Connector-Count > 1: separate Karten pro Connector mit Suffix (z. B. „CCS 01 (Tor 1) Links")
- Auto-Refresh alle 15s (oder Realtime-Subscription wenn machbar — hier reicht Polling, da kein Auth)
- Sprache: Standard auf Browser-Locale, fällt auf DE zurück
- Mobile-responsive Grid (1–2–3–4 Spalten)

### 5. Übersetzungen
Neue Keys in `src/i18n/tenantAppTranslations.ts`:
- `charging.publicLink.button` = "Öffentlicher Link"
- `charging.publicLink.dialogTitle`, `description`, `enable`, `disable`, `regenerate`, `copy`, `open`, `enabled`, `disabled`
- Status-Labels für Public-Page (existieren teils bereits)

## Sicherheits-Hinweise
- Token ist nicht erratbar (32-stellig kryptografisch zufällig)
- Edge Function liefert nur whitelist-Felder (kein `ocpp_password`, keine `access_settings`, keine Sessions)
- Rate-Limiting via Supabase-Standard
- `enabled = false` ⇒ Edge Function antwortet 404, ohne preiszugeben dass Token existiert
- Token wird im UI maskiert anzeigbar (optional)

## Memory-Update
Neuer Eintrag `mem://features/ev-charging/public-status-link.md` mit Token-Schema + URL-Format.

## Geänderte/Neue Dateien
- NEU `supabase/migrations/<timestamp>_public_charge_status_links.sql`
- NEU `supabase/functions/public-charge-status/index.ts`
- NEU `src/hooks/useTenantPublicStatusLink.ts`
- NEU `src/components/charging/PublicStatusLinkDialog.tsx`
- NEU `src/pages/PublicChargeStatus.tsx`
- EDIT `src/pages/ChargingPoints.tsx` (Button im Header)
- EDIT `src/App.tsx` (Route)
- EDIT `src/i18n/tenantAppTranslations.ts`
- NEU `.lovable/memory/features/ev-charging/public-status-link.md` + Index-Update