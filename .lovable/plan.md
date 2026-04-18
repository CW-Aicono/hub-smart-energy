

## Ziel
Ersatz von **Nabu Casa Remote UI** durch einen **Cloudflare Tunnel** im AICONO EMS Gateway Add-on. Damit erhält jede HA-Instanz eine eigene öffentliche `https://*.tunnel.aicono.org` URL, die als `api_url` in die Integration eingetragen wird – funktional 1:1-Ersatz, kostenfrei, ohne Hetzner-Server.

## Architektur

```text
Endkunde HA (Pi)                Cloudflare                AICONO Cloud
─────────────────              ─────────────              ─────────────
[ HA Core   ]                                            [ home-assistant-api ]
     ▲                                                          │
     │ http://supervisor                                        │ HTTPS
[ Add-on:        ]   ──── persistent QUIC ────►  [ tunnel ]     │
[ ems-gateway +  ]   (outbound, kein Port offen)     │          │
[ cloudflared    ]                                   ▼          ▼
                                          https://abc.tunnel.aicono.org
```

- Add-on startet zusätzlich `cloudflared` als Subprozess
- Tunnel-Token wird im Add-on hinterlegt (eine Konfig-Option)
- Cloudflare routet `<unique-id>.tunnel.aicono.org` → lokalen HA-Port 8123
- Die Edge Functions `home-assistant-api` und `ha-ws-proxy` bleiben **unverändert** (rufen die Tunnel-URL auf wie bisher die Nabu-URL)

## Voraussetzungen (einmalig)

1. Domain `tunnel.aicono.org` bei Cloudflare registriert/delegiert
2. Cloudflare Account + Tunnel-Service aktiviert (kostenfrei bis 50 GB/Monat/Tunnel – ausreichend für HA)
3. Wildcard-DNS `*.tunnel.aicono.org` → Cloudflare Tunnel
4. Provisioning-Service in der AICONO Cloud, der pro Liegenschaft einen neuen Cloudflare Tunnel + Tunnel-Token erzeugt (via Cloudflare API)

## Umsetzung

### 1. Cloudflare-Provisioning Edge Function (neu)
**Datei:** `supabase/functions/cf-tunnel-provision/index.ts`
- Input: `location_integration_id` 
- Aktion: Cloudflare API `POST /accounts/{id}/cfd_tunnel` → erzeugt Tunnel + Token, dann DNS-Record `<tunnel-id>.tunnel.aicono.org` → `<tunnel-id>.cfargotunnel.com`
- Speichert `tunnel_id`, `tunnel_token` (verschlüsselt), `public_url` in `location_integrations.config`
- Benötigt Secret: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`

### 2. HA Add-on Erweiterung
**Datei:** `docs/ha-addon/Dockerfile` + `docs/ha-addon/index.ts`
- Cloudflared-Binary in Image installieren (`apk add cloudflared` bzw. ARM64-Binary für Pi)
- Neue Konfig-Optionen in `config.yaml`:
  - `cloudflare_tunnel_token` (str, optional)
  - `cloudflare_enabled` (bool, default false)
- Beim Start: wenn Token gesetzt → `cloudflared tunnel --token <X> run` als Child-Process, mit Auto-Restart bei Crash
- Health-Check zeigt Tunnel-Status in der lokalen UI (`/api/status` erweitert um `tunnel: { connected, public_url }`)

### 3. UI-Anpassung in der Liegenschaft
**Datei:** `src/components/integrations/AddIntegrationDialog.tsx` + `src/lib/gatewayRegistry.ts`
- Beim Anlegen der HA-Integration neuer Button **"Tunnel automatisch einrichten"** (statt manuelle `api_url`-Eingabe)
- Klick → ruft `cf-tunnel-provision` Edge Function auf → setzt `api_url` automatisch auf die generierte Tunnel-URL und zeigt das `cloudflare_tunnel_token` zum Kopieren in die Add-on-Config an
- Manuelle `api_url`-Eingabe bleibt als Fallback erhalten (für bestehende Nabu-Casa-Nutzer)

### 4. Anleitung v8.3
**Datei (neu):** `/mnt/documents/AICONO_EMS_Gateway_Installation_v8.3.docx`
- Neues Kapitel **"4.3 Tunnel einrichten (statt Nabu Casa)"**:
  1. In der Cloud → Liegenschaft → Integration HA anlegen
  2. Button **"Tunnel automatisch einrichten"** klicken → `cloudflare_tunnel_token` kopieren
  3. In HA → Add-on Konfiguration → Token einfügen → Add-on neu starten
  4. Status "Verbunden" im Dashboard prüfen
- Altes Nabu-Casa-Kapitel als optionaler Fallback markieren
- QA: PDF-Konvertierung + Bildprüfung aller Seiten

## Sicherheit
- Cloudflare Tunnel-Token wird AES-256-GCM verschlüsselt in `location_integrations.config` gespeichert (Pattern wie BrightHub, Reuse von `crypto.ts`)
- Tunnel-URLs sind durch `home-assistant-api` HA-Token gesichert → unautorisierter Zugriff nicht möglich
- Cloudflare Access (optional, später) für zusätzliche Schutzschicht

## Out of Scope (für späteren Schritt)
- Komplette Ablösung von `home-assistant-api`/`ha-ws-proxy` durch direkten WS-Push (laut Antwort gewünscht, aber separater großer Umbau – als Phase 2 sinnvoll, nachdem Tunnel-Lösung stabil läuft)
- Multi-Tenant Cloudflare-Account-Trennung

## Benötigte Secrets (vor Implementierung)
- `CLOUDFLARE_API_TOKEN` (mit Tunnel:Edit + DNS:Edit Permissions)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID` für `tunnel.aicono.org`

