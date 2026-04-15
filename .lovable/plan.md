

# Cloud-basierter ws:// Proxy für ältere Wallboxen

## Problem

Supabase Edge Functions unterstützen ausschließlich **wss://** (TLS-verschlüsselt). Ältere Wallboxen können aber nur **ws://** (unverschlüsselt). Ein Raspberry Pi im Heimnetz des Nutzers ist eine unnötige Hürde.

## Lösung

Ein leichtgewichtiger **ws:// → wss:// Reverse-Proxy** als Docker-Container auf einem Cloud-Server (z.B. Hetzner VPS), der unter einer eigenen Domain erreichbar ist:

```text
Alte Wallbox (ws://) ──► ws://ocpp.aicono.org:80/CP001
                              │
                    Cloud-Proxy (Docker/Node.js)
                              │
                         wss://xnveugycurplszevdxtw.supabase.co
                              /functions/v1/ocpp-ws-proxy/CP001
```

## Was zu tun ist

### 1. Proxy-Server erstellen (neues Verzeichnis `docs/ocpp-cloud-proxy/`)
- `index.ts`: Node.js/ws-Server, der auf Port 80 lauscht, eingehende ws:// Verbindungen annimmt und 1:1 an die bestehende `ocpp-ws-proxy` Edge Function weiterleitet (wss://)
- Basic Auth wird transparent durchgereicht
- OCPP-Subprotokoll (`ocpp1.6`) wird korrekt propagiert
- Automatische Reconnect-Logik bei Upstream-Trennung
- `Dockerfile`, `docker-compose.yml`, `package.json`

### 2. Domain-Konfiguration
- Subdomain `ocpp.aicono.org` auf den VPS zeigen (A-Record)
- Port 80 für ws:// offen lassen (kein TLS nötig, da die Verschlüsselung auf der Upstream-Seite erfolgt)
- Optional: Port 443 mit Let's Encrypt für Wallboxen, die wss:// können (Dual-Mode)

### 3. Dashboard-Anpassung
- Auf der Ladepunkt-Detailseite die korrekte Verbindungs-URL anzeigen:
  - Neue Wallboxen: `wss://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy/{OCPP_ID}`
  - Alte Wallboxen: `ws://ocpp.aicono.org/{OCPP_ID}`
- Im Onboarding-Guide für Ladepunkte beide Optionen erklären

### 4. Einrichtungsanleitung
- Word-Dokument für die VPS-Einrichtung (Docker installieren, Container starten, Domain konfigurieren)

## Dateien

| Aktion | Datei |
|--------|-------|
| Neu | `docs/ocpp-cloud-proxy/index.ts` |
| Neu | `docs/ocpp-cloud-proxy/Dockerfile` |
| Neu | `docs/ocpp-cloud-proxy/docker-compose.yml` |
| Neu | `docs/ocpp-cloud-proxy/package.json` |
| Neu | `docs/ocpp-cloud-proxy/tsconfig.json` |
| Editieren | Ladepunkt-Detail (Verbindungs-URL-Anzeige) |
| Neu | Word-Anleitung in `/mnt/documents/` |

## Technische Details

- Der Proxy ist ein reiner **Passthrough** – keine OCPP-Logik, kein State. Alle Intelligenz bleibt in der bestehenden `ocpp-ws-proxy` Edge Function.
- Ressourcenbedarf: minimal (kleinster VPS reicht, ~2€/Monat bei Hetzner)
- Der gleiche Container kann auch den bestehenden Gateway Worker ersetzen, falls gewünscht
- Sicherheit: ws:// ist prinzipbedingt unverschlüsselt. Die Strecke Proxy → Backend ist aber immer wss://. Das Risiko liegt nur auf der Strecke Wallbox → Cloud-Proxy (Internet). Dies ist ein akzeptierter Kompromiss, den auch andere Anbieter (z.B. has.to.be, Reev) eingehen.

