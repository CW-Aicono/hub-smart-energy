---
name: Public Charge Point Status Link
description: Per-tenant shareable token URL /public/charge-status/{token} via edge function public-charge-status (no auth)
type: feature
---
Each tenant kann genau einen öffentlichen Status-Link für alle Ladepunkte erzeugen.

- Tabelle: `public_charge_status_links` (tenant_id UNIQUE, token, enabled)
- Edge Function: `public-charge-status` (verify_jwt = false), liest per Service-Role und liefert nur whitelisted Felder (kein ocpp_password, keine Sessions, keine access_settings)
- Token: 32 Zeichen kryptografisch zufällig (URL-safe Alphabet)
- Frontend-Route: `/public/charge-status/:token` rendert `PublicChargeStatus.tsx` (kein Auth-Wrapper, kein ModuleGuard)
- Polling: alle 15 s
- Dialog: `src/components/charging/PublicStatusLinkDialog.tsx` mit Aktivieren/Deaktivieren/Token regenerieren
- Multi-Connector-CPs werden als separate Karten dargestellt (analog Monta).
