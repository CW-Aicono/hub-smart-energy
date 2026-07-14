---
name: Ingest Key Model (Tenant vs Worker)
description: Zwei-Key-Modell für gateway-ingest — Tenant-Keys (aic_live_*) tenant-scoped in tenant_api_keys, GATEWAY_API_KEY nur für Hetzner-Bridges (Super-Admin)
type: feature
---

# Zwei-Key-Modell für `/gateway-ingest`

## Tenant-Keys (`aic_live_<32 base32>`)
- Tabelle: `public.tenant_api_keys` (SHA-256-Hash, Prefix, Label, last_used_at, revoked_at).
- Erzeugung/Verwaltung im Tenant-UI (`/integrations → API`) via Edge Functions
  `tenant-api-key-create` / `-list` / `-revoke`.
- Klartext-Key wird NUR einmalig bei Erzeugung angezeigt (Dialog).
- Auth-Reihenfolge in `gateway-ingest.validateApiKey`:
  1. Basic-Auth (gateway_devices) → tenantId aus device
  2. Bearer `aic_live_*` → SHA-256-Lookup in `tenant_api_keys` → tenantId fixiert
  3. Bearer == `GATEWAY_API_KEY` → tenantId = null (server-to-server / Worker)
- POST /readings: bei Tenant-Key MUSS `reading.tenant_id === key.tenant_id`, sonst skipped mit „tenant_id mismatch".

## Worker-Key (`GATEWAY_API_KEY`)
- Globales Env-Secret, wird **nicht** an Tenants ausgeliefert (`api-key-info` liefert nur Endpoint + Tenant-ID).
- Nur Hetzner-Bridges (`loxone-ws-worker`, etc.) verwenden ihn — sie pushen für mehrere Tenants.
- Rotation nur durch Super-Admin (Lovable-Secret-UI). Nach Rotation Hetzner-Worker neu deployen.

## Migration bestehender Kundenintegrationen
Kunden, die noch den alten globalen Key in eigenen Push-Integrationen verwenden, müssen in `/integrations → API` einen eigenen `aic_live_*`-Key erzeugen und den alten Key in ihrer Integration ersetzen. Bis dahin funktioniert der alte Key weiter (Worker-Pfad bleibt gültig), sollte aber nicht mehr verteilt werden.
