---
name: cloudflare-tunnel-domain
description: Cloudflare-Tunnel-Hostnames für Home-Assistant-Integrationen werden unter `*.aicono.org` (2-stufig) angelegt — NICHT unter `*.tunnel.aicono.org`. Grund: Universal SSL deckt nur 2-stufige Subdomains ab. Edge Function `cf-tunnel-provision` setzt `TUNNEL_DOMAIN = "aicono.org"`. Subdomain-Prefix = erste 12 Zeichen der Cloudflare-Tunnel-UUID → garantiert eindeutige Zuordnung Gateway ↔ Liegenschaft.
type: feature
---

## Cloudflare Tunnel — Domain-Konvention

- **Hostname-Schema:** `<12-stelliger-uuid-prefix>.aicono.org`, z. B. `b77488c1-e58.aicono.org`
- **NICHT** mehr `*.tunnel.aicono.org` (würde Cloudflare Advanced Certificate Manager erfordern, ~10 USD/Mo)
- **TLS:** Universal SSL deckt `*.aicono.org` automatisch ab.
- **Eindeutigkeit:** UUID-basiert, Kollisionswahrscheinlichkeit ~1:2,8×10¹⁴.

## Implementierung

`supabase/functions/cf-tunnel-provision/index.ts`:
```ts
const TUNNEL_DOMAIN = "aicono.org";
const subdomain = tunnel.id.slice(0, 12);
const fqdn = `${subdomain}.${TUNNEL_DOMAIN}`;
```

## Migration bestehender Tunnel

Bei Umstellung von `*.tunnel.aicono.org` → `*.aicono.org`:
1. `location_integrations.config` der betroffenen Liegenschaft: Felder `cloudflare_tunnel_id`, `cloudflare_tunnel_token_enc`, `cloudflare_public_url`, `cloudflare_provisioned_at`, `api_url` löschen.
2. Im UI „Tunnel einrichten" klicken → neue Provisionierung erzeugt frischen Hostname unter `*.aicono.org`.
3. Neuen Token im HA-Add-on einsetzen, Add-on neu starten.
4. Alter Tunnel + DNS-Record bleiben in Cloudflare ungenutzt liegen — manuell aufräumbar, stört aber nicht.
