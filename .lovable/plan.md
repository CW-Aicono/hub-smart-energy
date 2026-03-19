

## ws:// Fallback-Proxy für ältere OCPP-Ladepunkte

### Kontext

Die OCPP-Integration läuft aktuell ausschließlich über `wss://ocpp.aicono.org` (Edge Function). Ältere Ladepunkte, die nur `ws://` (unverschlüsselt) unterstützen, können sich nicht verbinden, da Edge Functions nur TLS-Endpunkte bereitstellen.

### Ansatz

Der bereits vorhandene **Gateway Worker** (Docker-Container, läuft on-premise oder auf einem Server) wird um einen lokalen WebSocket-Server erweitert, der als **TLS-Terminierungs-Proxy** fungiert:

```text
Ladepunkt (ws://) → Gateway Worker (ws://0.0.0.0:9000) → WSS Edge Function
```

Der Gateway Worker nimmt `ws://`-Verbindungen entgegen und leitet sie 1:1 als `wss://`-Verbindungen an die Edge Function weiter. Das OCPP-Subprotokoll wird transparent durchgereicht.

### Umsetzung

**1. Gateway Worker erweitern** (`docs/gateway-worker/index.ts`)

- Neuer optionaler WebSocket-Server auf konfigurierbarem Port (z.B. `OCPP_PROXY_PORT=9000`)
- Pfad-basierte Erkennung: `ws://gateway-ip:9000/{chargePointId}`
- Pro eingehende Verbindung:
  - Upstream-WSS-Verbindung zu `wss://ocpp.aicono.org/{chargePointId}` aufbauen
  - Optional: Basic Auth vom Ladepunkt durchreichen
  - OCPP-Subprotokoll (`ocpp1.6`) in beide Richtungen weitergeben
  - Bidirektionales Nachrichten-Forwarding
  - Disconnect in beide Richtungen propagieren
- Logging für Debugging
- Feature ist optional: ohne `OCPP_PROXY_PORT` startet kein Proxy

**2. Umgebungsvariablen**

| Variable | Default | Beschreibung |
|---|---|---|
| `OCPP_PROXY_PORT` | _(deaktiviert)_ | Port für den ws:// Proxy |
| `OCPP_PROXY_TARGET` | `wss://ocpp.aicono.org` | Ziel-WSS-URL |

**3. OCPP-Integrationsseite aktualisieren** (`src/pages/OcppIntegration.tsx`)

- Hinweis ergänzen, dass für ältere Ladepunkte ohne TLS-Unterstützung ein Gateway Worker als ws://-Proxy eingesetzt werden kann
- Link zur Konfigurationsanleitung

**4. Keine Datenbankänderungen nötig**

Der Proxy ist transparent – die Edge Function `ocpp-ws-proxy` sieht weiterhin eine normale WSS-Verbindung.

### Technische Details

```typescript
// Pseudo-Code für den Proxy im Gateway Worker
if (OCPP_PROXY_PORT) {
  const proxyServer = new WebSocket.Server({ port: OCPP_PROXY_PORT });
  
  proxyServer.on('connection', (clientWs, req) => {
    const cpId = extractChargePointId(req.url);
    const upstream = new WebSocket(
      `${OCPP_PROXY_TARGET}/${cpId}`,
      ['ocpp1.6'],
      { headers: extractAuthHeaders(req) }
    );
    
    // Bidirektionales Forwarding
    clientWs.on('message', data => upstream.send(data));
    upstream.on('message', data => clientWs.send(data));
    
    // Disconnect propagation
    clientWs.on('close', () => upstream.close());
    upstream.on('close', () => clientWs.close());
  });
}
```

### Sicherheitshinweis

- Der ws://-Proxy sollte nur in geschützten Netzwerken (LAN/VPN) betrieben werden
- Dieser Hinweis wird in der UI und Dokumentation deutlich kommuniziert

