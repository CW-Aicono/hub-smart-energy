

# Plan: lxcommunicator Integration im Gateway Worker

## Zusammenfassung

Die gesamte eigene Crypto-Implementierung (RSA Key Exchange, AES-256-CBC, getkey2, getjwt, authwithtoken -- ca. 450 Zeilen fehleranfälliger Code) wird durch die offizielle Loxone-Bibliothek `lxcommunicator` ersetzt. Diese Bibliothek wird von Loxone selbst gepflegt und implementiert das Protokoll nachweislich korrekt.

## Was sich ändert

### Entfernt (ca. 450 Zeilen)

- `loxoneAesEncrypt()` und `loxoneAesDecrypt()`
- `loxoneWsAuth()` (RSA Key Exchange, getkey2, getjwt)
- `loxoneAuthWithToken()` (getkey, authwithtoken)
- `loxoneTokenStore` (Token-Verwaltung)
- Alle manuellen WebSocket-Message-Handler fur Auth-Schritte

### Neu (ca. 80 Zeilen)

Die Funktion `connectLoxoneWs()` wird umgeschrieben. Statt manueller Auth nutzt sie:

```text
LxCommunicator.WebSocketConfig  -- Konfiguration (Protokoll, Permission APP)
LxCommunicator.BinarySocket     -- WebSocket mit Auth + Crypto
socket.open(host, user, pass)   -- Komplette Auth in einem Aufruf
socket.send("jdev/sps/enablebinstatusupdate") -- Status-Updates
delegate.socketOnEventReceived  -- Events empfangen
```

### Unverandert bleibt

- Docker-Setup (Dockerfile, package.json-Struktur)
- Supabase-Ingest (sendReadings, flushLoxoneBuffer)
- Spike Detection
- HTTP-Polling fur andere Gateways (Shelly, ABB, etc.)
- Loxone DNS-Cache
- UUID-Map und Meter-Zuordnung
- Reconnect-Logik (wird vereinfacht)
- Binar-Frame-Parser `parseLoxoneValueEvent()` (bleibt als Fallback)

## Technische Details

### 1. Neue Dependency

In `docs/gateway-worker/package.json`:

```json
"dependencies": {
  "ws": "^8.18.0",
  "lxcommunicator": "^1.2.0"
}
```

### 2. Neuer connectLoxoneWs() Aufbau

```typescript
function connectLoxoneWs(state: LoxoneWsState): void {
  const LxCommunicator = require("lxcommunicator");
  const WebSocketConfig = LxCommunicator.WebSocketConfig;

  const deviceInfo = "Gateway Worker";
  const config = new WebSocketConfig(
    WebSocketConfig.protocol.WS,   // oder WSS fur Gen2
    state.serialNumber,
    deviceInfo,
    WebSocketConfig.permission.APP, // Permission 4 = langlebiges Token
    false                           // kein TLS-Zertifikat
  );

  config.delegate = {
    socketOnEventReceived: (socket, events, type) => {
      // type 1 = ValueEvent, type 2 = TextEvent
      for (const event of events) {
        const uuid = event.uuid?.toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry && typeof event.value === "number") {
          if (!isSpike(event.value, entry.energy_type)) {
            entry.latest_value = event.value;
          }
        }
      }
    },
    socketOnConnectionClosed: (socket, code) => {
      state.authenticated = false;
      scheduleReconnect(state);
    },
    socketOnTokenConfirmed: (socket, response) => {
      log("info", `[Loxone] Token confirmed: ${state.serialNumber}`);
    },
    socketOnTokenReceived: (socket, response) => {
      log("info", `[Loxone] Token received: ${state.serialNumber}`);
    },
  };

  const socket = new LxCommunicator.BinarySocket(config);

  // host = DNS-aufgeloeste URL ohne Protokoll
  const host = state.baseUrl.replace(/^https?:\/\//, "");

  socket.open(host, state.username, state.password)
    .then(() => {
      state.authenticated = true;
      log("info", `[Loxone] Authenticated via lxcommunicator: ${state.serialNumber}`);
      return socket.send("jdev/sps/enablebinstatusupdate");
    })
    .then(() => {
      state.statusUpdatesEnabled = true;
      log("info", `[Loxone] Status updates enabled: ${state.serialNumber}`);
    })
    .catch((err) => {
      log("warn", `[Loxone] Connection failed: ${state.serialNumber}: ${err}`);
      scheduleReconnect(state);
    });

  state.ws = socket; // Typ-Anpassung noetig
}
```

### 3. LoxoneWsState Interface anpassen

Das `ws`-Feld wird auf `any` erweitert, da `BinarySocket` kein Standard-WebSocket ist:

```typescript
interface LoxoneWsState {
  // ...bestehende Felder...
  ws: any;  // war: WebSocket | null
  socket: any; // LxCommunicator.BinarySocket
}
```

### 4. Keepalive

`lxcommunicator` verwaltet Keepalive intern -- unser manueller 4-Minuten-Timer entfallt.

### 5. Reconnect

`scheduleReconnect()` bleibt, ruft aber `connectLoxoneWs()` auf, das nun `lxcommunicator` nutzt.

## Dateien die geandert werden

| Datei | Anderung |
|---|---|
| `docs/gateway-worker/index.ts` | Crypto-Code entfernen, lxcommunicator-Integration einbauen |
| `docs/gateway-worker/package.json` | `lxcommunicator` als Dependency hinzufugen |

## Risikobewertung

- **Gering**: `lxcommunicator` ist die offizielle Loxone-Bibliothek, wird auf npm gepflegt, und ist fur genau diesen Zweck gebaut
- **Getestet**: Die Bibliothek wird von der Loxone-Community (node-red, openHAB, etc.) produktiv eingesetzt
- **Fallback**: Falls etwas nicht funktioniert, liefern die Logs klare Fehlermeldungen der Bibliothek statt unserer eigenen kryptischen Timeout-Meldungen

## Deployment

Gleicher Ablauf wie bisher:

1. `docker stop gateway-worker && docker rm gateway-worker && docker rmi gateway-worker`
2. `index.ts` und `package.json` auf dem Pi aktualisieren
3. `docker build --no-cache -t gateway-worker .`
4. `docker run -d --name gateway-worker --restart unless-stopped -e SUPABASE_URL=... -e GATEWAY_API_KEY=... -e FLUSH_INTERVAL_MS=1000 gateway-worker`
5. `sleep 15 && docker logs --tail 80 gateway-worker`

