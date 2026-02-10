

# OCPP WebSocket-Proxy Edge Function

## Ziel

Eine neue Edge Function `ocpp-ws-proxy`, die als WebSocket-Server agiert und OCPP 1.6 JSON Nachrichten von Ladestationen entgegennimmt, die nur ws:// oder wss:// unterstuetzen. Die Funktion uebersetzt eingehende WebSocket-Nachrichten in HTTP-POST-Aufrufe an die bestehende `ocpp-central` Edge Function und leitet die Antworten per WebSocket zurueck.

## Architektur

```text
Ladestation (ws/wss)  -->  ocpp-ws-proxy (WebSocket)  -->  ocpp-central (HTTP POST)
                      <--  (WebSocket Response)        <--  (HTTP Response)
```

## Aenderungen

### 1. Neue Edge Function: `supabase/functions/ocpp-ws-proxy/index.ts`

- Nutzt `Deno.serve` mit WebSocket-Upgrade (`Deno.upgradeWebSocket`)
- Extrahiert die Charge-Point-ID aus dem URL-Pfad (Standard-OCPP-Konvention: `ws://host/ocpp-ws-proxy/{chargePointId}`)
- Unterstuetzt das OCPP-Subprotokoll `ocpp1.6` im WebSocket-Handshake
- Bei jeder eingehenden WebSocket-Nachricht:
  - Parst die OCPP-JSON-Nachricht
  - Leitet sie als HTTP POST an `ocpp-central?cp={chargePointId}` weiter
  - Sendet die HTTP-Antwort als WebSocket-Nachricht zurueck
- Heartbeat- und Verbindungs-Management (Ping/Pong)

### 2. Konfiguration: `supabase/config.toml`

- Neuer Eintrag `[functions.ocpp-ws-proxy]` mit `verify_jwt = false` (Ladestationen authentifizieren sich per OCPP-ID, nicht per JWT)

### 3. UI-Anpassung: Integrationshinweise in `src/pages/ChargingPoints.tsx`

- Aktualisierung der OCPP-Integrationshinweise im Add/Edit-Dialog:
  - HTTP-Endpoint (wie bisher)
  - **Neu**: WebSocket-Endpoint `wss://{supabase_url}/functions/v1/ocpp-ws-proxy/{ocpp_id}` mit Subprotokoll `ocpp1.6`
  - Hinweis, dass kein externer Proxy mehr noetig ist

## Technische Details

- Deno.serve unterstuetzt nativ WebSocket-Upgrades, daher kann die Edge Function direkt als WebSocket-Server fungieren
- Die Proxy-Funktion nutzt `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` um intern die `ocpp-central` Function aufzurufen
- Fehlerbehandlung: Bei Verbindungsabbruch oder Fehlern wird der WebSocket sauber geschlossen
- Die Ladestation verbindet sich einmalig per WebSocket; jede Nachricht wird einzeln an das HTTP-Backend weitergeleitet

