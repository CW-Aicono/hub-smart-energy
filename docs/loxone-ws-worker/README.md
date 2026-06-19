# Loxone WebSocket Worker – Schritt-für-Schritt für Anfänger

> **Ziel:** Ein kleines Programm auf Ihrem Hetzner-Server installieren, das automatisch eine dauerhafte Verbindung zu Ihrem Loxone-Miniserver aufbaut.  
> **Zeitaufwand:** ca. 20–30 Minuten (meiste Zeit wartet man, dass der Computer fertig wird).  
> **Vorkenntnisse:** Keine. Sie müssen nur genau das tun, was hier steht.

---

## Was macht das überhaupt? (ganz einfach erklärt)

Ihr Loxone-Miniserver hat dauernd neue Werte (Temperatur, Stromverbrauch, Schalter-Status). Normalerweise fragt AICONO diese Werte nur alle 15 Minuten ab. Das ist manchmal zu langsam.

Dieses Programm (der „Worker“) sitzt auf Ihrem Hetzner-Server und hält eine **dauerhafte Verbindung** zu Ihrem Miniserver offen. Sobald sich ein Wert ändert, kommt er sofort bei AICONO an – in Echtzeit.

> **Wichtig:** Der Worker ersetzt nichts. Das alte Abfragen läuft weiter als Sicherheitsnetz. Er ist nur ein **Zusatz** für den Feldtest.

---

## Was brauchen Sie vorher?

| Was | Woher | Wofür |
|-----|-------|-------|
| Zugang zu Ihrem Hetzner-Server | Bekommen Sie von Ihrem IT-Administrator oder Hetzner-Login | Dort wird das Programm installiert |
| Docker | Ist meist schon auf dem Hetzner-Server installiert | Damit läuft das Programm in einer geschlossenen Box |
| Den `GATEWAY_API_KEY` | AICONO-Backend → Einstellungen → Integrationen → Reiter **API** | Damit sich das Programm bei AICONO anmelden kann |
| Mindestens ein Loxone-Standort mit Seriennummer, Benutzername und Passwort | In Ihrer Loxone-Konfiguration hinterlegt | Damit verbindet sich das Programm mit dem Miniserver |

> **Sie brauchen keine Programmierkenntnisse.** Sie kopieren nur Textblöcke und fügen sie ein.

---

## Wichtige Warnung

Diese Funktion ist ein **Feldtest (BETA)**. Bitte aktivieren Sie sie nur an 2–3 Test-Standorten, nicht an allen Kunden-Standorten. Wenn etwas schiefgeht, können Sie sie jederzeit wieder ausschalten.

---

## Schritt 0: Auf Ihren Hetzner-Server zugreifen

Sie müssen sich auf Ihren Server „einklinken“, als würden Sie eine Fernwartung starten.

### Windows:

1. Drücken Sie die **Windows-Taste**.
2. Tippen Sie `cmd` und drücken Sie **Enter**.
3. Ein schwarzes Fenster öffnet sich (das ist die Eingabeaufforderung).

### Mac:

1. Drücken Sie **Cmd + Leertaste**.
2. Tippen Sie `Terminal` und drücken Sie **Enter**.

### Den Verbindungsbefehl eingeben:

Tippen Sie folgenden Befehl ein und drücken Sie **Enter**. Ersetzen Sie `root` und `123.456.789.012` durch den Benutzernamen und die IP-Adresse, die Sie von Ihrem Administrator bekommen haben:

```bash
ssh root@123.456.789.012
```

> **Was passiert hier?** `ssh` ist wie ein sicheres Telefon zu Ihrem Server. Sie sehen danach ein Passwort-Feld oder eine Frage, ob Sie dem Server vertrauen. Tippen Sie `yes` (falls gefragt) und dann Ihr Passwort.  
> **Tipp:** Wenn Sie das Passwort eingeben, erscheinen keine Sternchen – das ist normal. Einfach tippen und Enter drücken.

Wenn alles geklappt hat, sehen Sie jetzt etwas wie:

```
root@mein-server:~#
```

Das bedeutet: Sie sind drin! Ab jetzt sind alle Befehle für Ihren Server.

---

## Schritt 1: Einen Ordner erstellen

Das Programm braucht einen eigenen Ordner auf dem Server. Tippen Sie exakt diesen Befehl ein und drücken Sie **Enter**:

```bash
mkdir -p /opt/loxone-ws-worker
```

> **Was passiert hier?** `mkdir` heißt „make directory“ – einen Ordner erstellen. `/opt/loxone-ws-worker` ist der Pfad, also die Adresse des Ordners.

Wechseln Sie in den Ordner:

```bash
cd /opt/loxone-ws-worker
```

> **Was passiert hier?** `cd` heißt „change directory“ – in den Ordner springen. Die Zeile `root@mein-server:/opt/loxone-ws-worker#` zeigt Ihnen danach, dass Sie im richtigen Ordner sind.

---

## Schritt 2: Die erste Datei anlegen (package.json)

Diese Datei sagt dem Programm, welche Hilfs-Bibliotheken es braucht. Sie müssen nicht verstehen, was drinsteht – einfach kopieren und einfügen.

Tippen Sie folgenden Befehl ein. **Achtung:** Kopieren Sie den kompletten Block von `cat` bis `EOF`, fügen Sie ihn ein und drücken Sie **Enter**.

```bash
cat << 'EOF' > package.json
{
  "name": "loxone-ws-worker",
  "version": "0.1.0",
  "description": "Feldtest-Worker: persistente Loxone-WebSocket über Remote Connect",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node index.ts"
  },
  "dependencies": {
    "lxcommunicator": "^1.1.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.13",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  }
}
EOF
```

> **Was passiert hier?** `cat << 'EOF'` sagt dem Computer: „Schreibe alles, was jetzt kommt, in eine Datei, bis ich `EOF` sage.“ Die Datei heißt `package.json`.

---

## Schritt 3: Die zweite Datei anlegen (tsconfig.json)

Diese Datei sagt dem Computer, wie er das Programm übersetzen soll. Wieder: einfach kopieren, einfügen, Enter.

```bash
cat << 'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["index.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

---

## Schritt 4: Die dritte Datei anlegen (Dockerfile)

Diese Datei baut eine geschlossene Box (einen „Container“), in der das Programm läuft. So kann nichts mit anderen Programmen auf dem Server kollidieren.

```bash
cat << 'EOF' > Dockerfile
# Loxone WS Worker – Dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY index.ts ./
RUN npm run build

FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S worker -u 1001
USER worker
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV FLUSH_INTERVAL_MS=1000
ENV RELOAD_INTERVAL_MS=300000
ENV BRIDGE_WORKER_NAME=hetzner-bridge-test
ENV BRIDGE_HEARTBEAT_MS=30000
ENV HEALTH_PORT=8080

EXPOSE 8080

# Healthcheck nutzt den eingebauten /healthz Endpoint
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "index.js"]
EOF
```

---

## Schritt 5: Die vierte Datei anlegen (index.ts)

Das ist das eigentliche Programm. Es ist etwas länger, aber Sie müssen es trotzdem nur kopieren und einfügen.

> **Tipp:** Klicken Sie in das Terminal-Fenster, drücken Sie **Rechtsklick** (Windows) oder **Cmd + V** (Mac), um den Text einzufügen. Warten Sie, bis alles eingefügt ist, und drücken Sie dann **Enter**.

```bash
cat << 'EOF' > index.ts
/**
 * Loxone Remote-Connect WebSocket Worker (Feldtest)
 * ==================================================
 * Hält pro Loxone-Miniserver, der für den Feldtest freigeschaltet ist
 * (location_integrations.loxone_remote_connect_ws_enabled = TRUE), EINE
 * persistente WebSocket-Verbindung über Loxone Remote Connect
 * (dns.loxonecloud.com/<serial>).
 *
 * Aufgaben:
 *   1. Meter-Liste alle 5 Min beim Backend abfragen
 *   2. Pro Miniserver einen lxcommunicator-Socket aufbauen
 *      (übernimmt Auth, AES, JWT, Keepalive)
 *   3. Werte sekündlich an gateway-ingest pushen
 *   4. Session-Start/-Ende loggen
 *   5. Phase 2: Heartbeat an bridge_workers + Diagnose-Events an bridge_event_log
 *   6. Phase 2: HTTP-Endpoint /healthz und /state
 *
 * Umgebungsvariablen:
 *   SUPABASE_URL        z. B. https://ihre-projekt-id.supabase.co
 *   GATEWAY_API_KEY     Bearer Token (gleicher Wert wie bei gateway-ingest)
 *   FLUSH_INTERVAL_MS   Wie oft Werte gepusht werden (Standard: 5000)
 *   MIN_PUSH_INTERVAL_MS Mindestabstand zwischen 2 Pushes desselben Werts (Standard: 60000)
 *   MIN_DELTA           Minimale Änderung in kW, ab der gepusht wird (Standard: 0.01)
 *   RELOAD_INTERVAL_MS  Wie oft die Meter-Liste neu geladen wird (Standard: 300000)
 *   LOG_LEVEL           "debug" | "info" | "warn" | "error" (Standard: "info")
 *   WORKER_HOST         Freier Text, taucht im Session-Log auf (Standard: hostname)
 *   BRIDGE_WORKER_NAME  Name in Tabelle bridge_workers (Standard: hetzner-bridge-test)
 *   BRIDGE_HEARTBEAT_MS Heartbeat-Intervall in ms (Standard: 30000)
 *   HEALTH_PORT         HTTP-Port für /healthz und /state (Standard: 8080, 0 = aus)
 *   WORKER_VERSION      Versions-String, taucht in bridge_workers.version auf
 */

import os from "os";
import http from "http";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "5000", 10);
const MIN_PUSH_INTERVAL_MS = parseInt(process.env.MIN_PUSH_INTERVAL_MS || "60000", 10);
const MIN_DELTA = parseFloat(process.env.MIN_DELTA || "0.01");
const RELOAD_INTERVAL_MS = parseInt(process.env.RELOAD_INTERVAL_MS || "300000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";
const WORKER_HOST = process.env.WORKER_HOST || os.hostname();
const BRIDGE_WORKER_NAME = process.env.BRIDGE_WORKER_NAME || "hetzner-bridge-test";
const BRIDGE_HEARTBEAT_MS = parseInt(process.env.BRIDGE_HEARTBEAT_MS || "30000", 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "8080", 10);
const WORKER_VERSION = process.env.WORKER_VERSION || "phase2-skeleton";

if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL und GATEWAY_API_KEY müssen gesetzt sein");
  process.exit(1);
}

const INGEST_URL = `${SUPABASE_URL}/functions/v1/gateway-ingest`;

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;
function log(level: keyof typeof LOG_LEVELS, msg: string, ...args: any[]) {
  if (LOG_LEVELS[level] >= currentLevel) {
    const ts = new Date().toISOString();
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${ts}] [${level.toUpperCase()}] ${msg}`, ...args);
  }
}

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000, gas: 5000, wasser: 1000, wärme: 5000, kälte: 2000, default: 50000,
};
function isSpike(v: number, energyType: string): boolean {
  if (!isFinite(v) || isNaN(v)) return true;
  return Math.abs(v) > (SPIKE_THRESHOLDS[energyType] ?? SPIKE_THRESHOLDS.default);
}

async function ingestGet(action: string): Promise<any> {
  const r = await fetch(`${INGEST_URL}?action=${action}`, {
    headers: { Authorization: `Bearer ${GATEWAY_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GET ${action} HTTP ${r.status}`);
  return r.json();
}

async function ingestPost(action: string | null, body: any): Promise<any> {
  const url = action ? `${INGEST_URL}?action=${action}` : INGEST_URL;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GATEWAY_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`POST ${action ?? "(readings)"} HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// Bridge-Worker (Phase 2): Heartbeat & Event-Log
async function bridgeHeartbeat(status: "online" | "degraded" | "offline" = "online", lastError: string | null = null): Promise<void> {
  const linksState: Array<{ miniserver_serial: string; last_connected_at?: string; last_event_at?: string }> = [];
  for (const s of connections.values()) {
    const item: any = { miniserver_serial: s.serialNumber };
    if (s.lastConnectedAt) item.last_connected_at = new Date(s.lastConnectedAt).toISOString();
    if (s.lastEventAt) item.last_event_at = new Date(s.lastEventAt).toISOString();
    linksState.push(item);
  }
  try {
    await ingestPost("bridge-heartbeat", {
      worker_name: BRIDGE_WORKER_NAME, version: WORKER_VERSION, host: WORKER_HOST,
      status, last_error: lastError, links_state: linksState,
    });
  } catch (err) {
    log("debug", `[Bridge] heartbeat fehlgeschlagen: ${(err as Error).message}`);
  }
}

async function bridgeLog(severity: "debug" | "info" | "warn" | "error", event_type: string,
  message: string, miniserver_serial?: string, details?: unknown): Promise<void> {
  try {
    await ingestPost("bridge-log-event", {
      worker_name: BRIDGE_WORKER_NAME, severity, event_type, message, miniserver_serial, details,
    });
  } catch { /* never crash on event-log failure */ }
}

interface WsMeter {
  id: string; name: string; energy_type: string; sensor_uuid: string;
  tenant_id: string; location_integration_id: string;
  location_integration: { id: string; config: { serial_number?: string; username?: string; password?: string } };
}

interface UuidEntry {
  meter_id: string; tenant_id: string; energy_type: string;
  latest_value: number | null; last_pushed_value: number | null; last_pushed_at: number;
}

interface ConnState {
  serialNumber: string; username: string; password: string;
  tenantId: string; locationIntegrationId: string;
  uuidMap: Map<string, UuidEntry>;
  ws: any; authenticated: boolean; reconnectDelay: number; reconnecting: boolean;
  sessionId: string | null; eventsReceived: number; reconnectCount: number;
  lastConnectedAt: number; lastEventAt: number;
}

const connections = new Map<string, ConnState>();

const dnsCache = new Map<string, string>();
async function resolveLoxoneHost(serial: string): Promise<string | null> {
  if (dnsCache.has(serial)) return dnsCache.get(serial)!;
  try {
    const r = await fetch(`https://dns.loxonecloud.com/${serial}`, {
      method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000),
    });
    const finalUrl = r.url;
    if (finalUrl && finalUrl.toLowerCase().includes(serial.toLowerCase())) {
      const host = new URL(finalUrl).host;
      dnsCache.set(serial, host);
      log("info", `[DNS] ${serial} → ${host}`);
      return host;
    }
  } catch (err) {
    log("warn", `[DNS] ${serial} fehlgeschlagen: ${(err as Error).message}`);
  }
  const fb = `${serial.toLowerCase()}.dns.loxonecloud.com`;
  dnsCache.set(serial, fb);
  return fb;
}

async function sessionStart(state: ConnState): Promise<void> {
  try {
    const r = await ingestPost("ws-session-start", {
      tenant_id: state.tenantId, location_integration_id: state.locationIntegrationId, worker_host: WORKER_HOST,
    });
    state.sessionId = r.session_id || null;
    state.eventsReceived = 0;
    state.reconnectCount = 0;
  } catch (err) { log("warn", `[Session] start fehlgeschlagen: ${(err as Error).message}`); }
}

async function sessionEnd(state: ConnState, reason: string): Promise<void> {
  if (!state.sessionId) return;
  try {
    await ingestPost("ws-session-end", {
      session_id: state.sessionId, disconnect_reason: reason,
      events_received: state.eventsReceived, reconnect_count: state.reconnectCount,
    });
  } catch (err) { log("warn", `[Session] end fehlgeschlagen: ${(err as Error).message}`); }
  state.sessionId = null;
}

async function connect(state: ConnState): Promise<void> {
  if (state.ws) { try { state.ws.close(); } catch { /* ignore */ } state.ws = null; }
  state.authenticated = false;

  const host = await resolveLoxoneHost(state.serialNumber);
  if (!host) {
    bridgeLog("warn", "dns_failed", `DNS-Auflösung fehlgeschlagen: ${state.serialNumber}`, state.serialNumber);
    scheduleReconnect(state, "dns-failed");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LxCommunicator = require("lxcommunicator");
  const config = new LxCommunicator.WebSocketConfig(
    LxCommunicator.WebSocketConfig.protocol.WSS, state.serialNumber,
    "LoxoneWsWorker", LxCommunicator.WebSocketConfig.permission.APP, false,
  );

  config.delegate = {
    socketOnEventReceived: (_s: any, events: any[]) => {
      for (const ev of events) {
        const uuid = (ev.uuid || "").toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry && typeof ev.value === "number" && !isSpike(ev.value, entry.energy_type)) {
          entry.latest_value = ev.value;
          state.eventsReceived++;
          state.lastEventAt = Date.now();
        }
      }
    },
    socketOnConnectionClosed: (_s: any, code: number) => {
      log("warn", `[WS] ${state.serialNumber} geschlossen (code=${code})`);
      bridgeLog("warn", "ws_closed", `WebSocket geschlossen (code=${code})`, state.serialNumber, { code });
      state.authenticated = false; state.ws = null;
      sessionEnd(state, `close-${code}`);
      scheduleReconnect(state, `close-${code}`);
    },
    socketOnTokenRefreshFailed: () => {
      log("warn", `[WS] Token-Refresh fehlgeschlagen: ${state.serialNumber}`);
      bridgeLog("error", "token_refresh_failed", "Token-Refresh fehlgeschlagen", state.serialNumber);
    },
  };

  const socket = new LxCommunicator.WebSocket(config);
  state.ws = socket;

  log("info", `[WS] verbinde ${state.serialNumber} → ${host}`);
  try {
    await socket.open(host, state.username, state.password);
    await socket.send("jdev/sps/enablebinstatusupdate");
    state.authenticated = true;
    state.reconnectDelay = 1000;
    state.lastConnectedAt = Date.now();
    await sessionStart(state);
    log("info", `[WS] authentifiziert ${state.serialNumber} (${state.uuidMap.size} UUIDs)`);
    bridgeLog("info", "ws_connected", `Verbunden, ${state.uuidMap.size} UUIDs abonniert`, state.serialNumber);
  } catch (err) {
    log("warn", `[WS] Verbindung fehlgeschlagen ${state.serialNumber}: ${err}`);
    bridgeLog("error", "ws_connect_failed", `Verbindung fehlgeschlagen: ${(err as Error).message ?? err}`, state.serialNumber);
    state.ws = null;
    scheduleReconnect(state, `connect-error: ${(err as Error).message ?? err}`);
  }
}

function scheduleReconnect(state: ConnState, reason: string): void {
  if (state.reconnecting) return;
  state.reconnecting = true;
  state.reconnectCount++;
  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 60000);
  log("info", `[WS] Reconnect ${state.serialNumber} in ${delay}ms (reason=${reason})`);
  bridgeLog("info", "ws_reconnect_scheduled", `Reconnect in ${delay}ms (Grund: ${reason})`, state.serialNumber, { delay_ms: delay, reason });
  setTimeout(() => { state.reconnecting = false; connect(state); }, delay);
}

async function flush(): Promise<void> {
  const readings: any[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  for (const state of connections.values()) {
    if (!state.authenticated) continue;
    for (const entry of state.uuidMap.values()) {
      if (entry.latest_value === null) continue;
      const prev = entry.last_pushed_value;
      const ageMs = nowMs - entry.last_pushed_at;
      const delta = prev === null ? Infinity : Math.abs(entry.latest_value - prev);
      const changed = delta >= MIN_DELTA;
      const stale = ageMs >= MIN_PUSH_INTERVAL_MS;
      if (!changed && !stale) continue;
      readings.push({
        meter_id: entry.meter_id, tenant_id: entry.tenant_id,
        power_value: entry.latest_value, energy_type: entry.energy_type, recorded_at: nowIso,
      });
      entry.last_pushed_value = entry.latest_value;
      entry.last_pushed_at = nowMs;
    }
  }
  if (readings.length === 0) return;
  try {
    await ingestPost(null, { readings });
    log("debug", `[Flush] ${readings.length} Werte gepusht`);
  } catch (err) {
    log("warn", `[Flush] fehlgeschlagen: ${(err as Error).message}`);
  }
}

async function reloadMeters(): Promise<void> {
  let meters: WsMeter[] = [];
  try {
    const r = await ingestGet("list-loxone-ws-meters");
    meters = (r.meters || []) as WsMeter[];
  } catch (err) {
    log("error", `[Reload] fehlgeschlagen: ${(err as Error).message}`);
    return;
  }

  const bySerial = new Map<string, { config: any; meters: WsMeter[]; tenantId: string; integrationId: string }>();
  for (const m of meters) {
    const cfg = m.location_integration?.config;
    if (!cfg?.serial_number || !cfg.username || !cfg.password || !m.sensor_uuid) continue;
    const serial = cfg.serial_number;
    if (!bySerial.has(serial)) {
      bySerial.set(serial, { config: cfg, meters: [], tenantId: m.tenant_id, integrationId: m.location_integration_id });
    }
    bySerial.get(serial)!.meters.push(m);
  }

  for (const [serial, group] of bySerial) {
    let state = connections.get(serial);
    if (!state) {
      state = {
        serialNumber: serial, username: group.config.username, password: group.config.password,
        tenantId: group.tenantId, locationIntegrationId: group.integrationId,
        uuidMap: new Map(), ws: null, authenticated: false,
        reconnectDelay: 1000, reconnecting: false,
        sessionId: null, eventsReceived: 0, reconnectCount: 0,
        lastConnectedAt: 0, lastEventAt: 0,
      };
      connections.set(serial, state);
    }
    state.uuidMap.clear();
    for (const m of group.meters) {
      state.uuidMap.set(m.sensor_uuid.toLowerCase(), {
        meter_id: m.id, tenant_id: m.tenant_id, energy_type: m.energy_type,
        latest_value: null, last_pushed_value: null, last_pushed_at: 0,
      });
    }
    if (!state.ws) connect(state);
  }

  for (const [serial, state] of connections) {
    if (!bySerial.has(serial)) {
      log("info", `[Reload] entferne ${serial} (nicht mehr im Feldtest)`);
      try { state.ws?.close(); } catch { /* ignore */ }
      await sessionEnd(state, "removed-from-test");
      connections.delete(serial);
    }
  }
  log("info", `[Reload] aktive Miniserver: ${connections.size}`);
}

// Health-HTTP-Server (Phase 2)
function startHealthServer(): void {
  if (!HEALTH_PORT || HEALTH_PORT <= 0) return;
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, worker: BRIDGE_WORKER_NAME, host: WORKER_HOST }));
      return;
    }
    if (req.url === "/state") {
      const state = {
        worker: BRIDGE_WORKER_NAME, version: WORKER_VERSION, host: WORKER_HOST,
        connections: Array.from(connections.values()).map((c) => ({
          serial: c.serialNumber, authenticated: c.authenticated, uuids: c.uuidMap.size,
          events_received: c.eventsReceived, reconnect_count: c.reconnectCount,
          last_connected_at: c.lastConnectedAt ? new Date(c.lastConnectedAt).toISOString() : null,
          last_event_at: c.lastEventAt ? new Date(c.lastEventAt).toISOString() : null,
        })),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state, null, 2));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, () => log("info", `[Health] HTTP-Endpoint auf Port ${HEALTH_PORT} (GET /healthz, /state)`));
}

async function main() {
  log("info", `Loxone WS Worker startet — worker=${BRIDGE_WORKER_NAME} host=${WORKER_HOST} version=${WORKER_VERSION}`);
  log("info", `  SUPABASE_URL=${SUPABASE_URL}`);
  log("info", `  FLUSH_INTERVAL_MS=${FLUSH_INTERVAL_MS}  RELOAD_INTERVAL_MS=${RELOAD_INTERVAL_MS}  BRIDGE_HEARTBEAT_MS=${BRIDGE_HEARTBEAT_MS}`);

  startHealthServer();

  const shutdown = async (signal: string) => {
    log("info", `${signal} — beende Sessions...`);
    await bridgeHeartbeat("offline", `shutdown-${signal}`);
    await bridgeLog("info", "worker_shutdown", `Worker beendet (${signal})`);
    for (const state of connections.values()) {
      try { state.ws?.close(); } catch { /* ignore */ }
      await sessionEnd(state, `shutdown-${signal}`);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await bridgeHeartbeat("online");
  await bridgeLog("info", "worker_started", `Worker gestartet auf ${WORKER_HOST}`);

  await reloadMeters();
  setInterval(reloadMeters, RELOAD_INTERVAL_MS);
  setInterval(() => { flush().catch((e) => log("error", "flush:", e)); }, FLUSH_INTERVAL_MS);
  setInterval(() => { bridgeHeartbeat("online").catch(() => {}); }, BRIDGE_HEARTBEAT_MS);

  setInterval(async () => {
    for (const state of connections.values()) {
      if (!state.sessionId || !state.authenticated) continue;
      try {
        await ingestPost("ws-session-heartbeat", {
          session_id: state.sessionId, events_received: state.eventsReceived, reconnect_count: state.reconnectCount,
        });
      } catch (err) { log("debug", `[Heartbeat] ${state.serialNumber}: ${(err as Error).message}`); }
    }
  }, 15000);
}

main().catch((err) => { console.error("[FATAL]", err); process.exit(1); });
EOF
```

> **Wichtig:** Warten Sie, bis der Cursor wieder erscheint (das kann ein paar Sekunden dauern). Wenn Sie stattdessen `cat >` sehen, haben Sie möglicherweise das `EOF` am Ende nicht richtig eingefügt. In dem Fall drücken Sie **Strg + C**, um abzubrechen, und fangen Sie bei Schritt 5 nochmal an.

---

## Schritt 6: Das Docker-Image bauen

Jetzt bauen wir die geschlossene Box (den Container). Tippen Sie:

```bash
docker build -t loxone-ws-worker .
```

> **Was passiert hier?** Docker liest die Dateien, lädt Hilfsprogramme herunter und packt alles zusammen.  
> **Dauer:** ca. 1–2 Minuten beim ersten Mal. Sie sehen viele Zeilen mit „Downloading“ und „Installing“ – das ist normal.  
> **Fertig:** Wenn am Ende `Successfully tagged loxone-ws-worker:latest` steht, hat es geklappt.

---

## Schritt 7: Den Container starten

Bevor Sie den folgenden Befehl eingeben, müssen Sie **zwei Platzhalter ersetzen**:

1. `[HIER_SUPABASE_URL]` → Ihre Supabase-URL. Diese bekommen Sie von Ihrem Administrator. Sie sieht aus wie `https://abcdefg12345.supabase.co`.
2. `[HIER_API_KEY]` → Ihr `GATEWAY_API_KEY`. Diesen finden Sie im AICONO-Backend unter **Einstellungen → Integrationen → Reiter API**. Dort steht ein Feld mit der Beschriftung **API-Key** – kopieren Sie den Wert daraus.

Ersetzen Sie die Platzhalter im folgenden Befehl und fügen Sie ihn ein:

```bash
docker run -d --restart=always --name loxone-ws-worker \
  -p 8080:8080 \
  -e SUPABASE_URL=[HIER_SUPABASE_URL] \
  -e GATEWAY_API_KEY=[HIER_API_KEY] \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
  loxone-ws-worker
```

> **Beispiel, wie es aussieht, wenn es fertig ist:**
> ```bash
> docker run -d --restart=always --name loxone-ws-worker \
>   -p 8080:8080 \
>   -e SUPABASE_URL=https://abcdefg12345.supabase.co \
>   -e GATEWAY_API_KEY=sk_live_51H8xyz... \
>   -e LOG_LEVEL=info \
>   -e WORKER_HOST=hetzner-prod-1 \
>   -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
>   loxone-ws-worker
> ```

> **Was passiert hier?**
> - `docker run` startet die Box. `-d` bedeutet „im Hintergrund".
> - `--restart=always` startet die Box automatisch nach einem Server-Neustart.
> - `-p 8080:8080` öffnet den Port 8080 für die Statusseite (`/healthz` und `/state`).
> - `WORKER_HOST` ist ein beliebiger Name, taucht im Log auf.
> - `BRIDGE_WORKER_NAME` muss exakt mit dem Eintrag in der Tabelle `bridge_workers` übereinstimmen (Standard: `hetzner-bridge-test`, ist bereits angelegt).

Wenn alles geklappt hat, sehen Sie eine lange Zeichenkette aus Buchstaben und Zahlen – das ist die ID des gestarteten Containers.

---

## Schritt 8: Prüfen, ob es läuft

Schauen wir nach, ob das Programm gestartet ist und arbeitet:

```bash
docker logs -f loxone-ws-worker
```

> **Was passiert hier?** Sie sehen das „Tagebuch" des Programms. `-f` bedeutet: Zeige neue Einträge sofort an.

Drücken Sie **Enter**. Sie sollten nach einigen Sekunden etwa Folgendes sehen:

```
[INFO] Loxone WS Worker startet — worker=hetzner-bridge-test host=hetzner-prod-1 version=phase2-skeleton
[INFO]   SUPABASE_URL=https://...
[INFO]   FLUSH_INTERVAL_MS=1000  RELOAD_INTERVAL_MS=300000  BRIDGE_HEARTBEAT_MS=30000
[INFO] [Health] HTTP-Endpoint auf Port 8080 (GET /healthz, /state)
[INFO] [Reload] aktive Miniserver: 0
```

**Steht dort `aktive Miniserver: 0`?** Das ist im Moment noch richtig! Das bedeutet nur, dass noch kein Standort im Backend für den Feldtest freigeschaltet wurde.

**Zweite kurze Prüfung – die Statusseite:** Tippen Sie auf dem Server (oder von Ihrem Rechner aus, falls Port 8080 nach außen geöffnet ist):

```bash
curl http://127.0.0.1:8080/healthz
```

Sie sollten so etwas sehen:

```
{"ok":true,"worker":"hetzner-bridge-test","host":"hetzner-prod-1"}
```

Drücken Sie **Strg + C**, um die Log-Anzeige zu beenden (das Programm läuft weiter im Hintergrund).

---

## Schritt 9: Im AICONO-Backend freischalten

Jetzt müssen Sie dem System sagen: „Dieser Standort darf am Feldtest teilnehmen.“

### Für Tenant-Administratoren (die einfache Methode):

1. Melden Sie sich im AICONO-Backend an.
2. Gehen Sie zu dem Standort, an dem der Loxone-Miniserver hängt.
3. Klicken Sie auf die Loxone-Integration (die Karte mit dem Miniserver).
4. Klicken Sie auf das **Zahnrad-Symbol** (Bearbeiten).
5. Scrollen Sie nach unten zum Abschnitt **„Remote Connect WebSocket (BETA)“**.
6. Klicken Sie auf den Button **„Aktivieren“**.
7. Das System speichert die Einstellung automatisch.

> **Wichtig:** Dieser Button ist nur für Test-Standorte gedacht. Aktivieren Sie ihn nicht auf Produktiv-Systemen.

### Für Super-Administratoren (Fallback):

Falls der Button nicht sichtbar ist oder Sie mehrere Standorte auf einmal freischalten möchten, können Sie im Super-Admin-Bereich unter **SQL-Editor** folgenden Befehl ausführen:

```sql
UPDATE location_integrations
SET loxone_remote_connect_ws_enabled = TRUE
WHERE id IN ('<integration-id-1>', '<integration-id-2>');
```

> Ersetzen Sie `<integration-id-1>` und `<integration-id-2>` durch die tatsächlichen IDs der Standorte. Diese finden Sie in der Datenbank oder fragen Sie Ihren Administrator.

---

## Schritt 10: Warten und nochmal prüfen

Nachdem Sie den Standort freigeschaltet haben, warten Sie **maximal 5 Minuten**. Der Worker lädt die Liste automatisch neu.

Schauen Sie nochmal in die Logs:

```bash
docker logs -f loxone-ws-worker
```

Jetzt sollten Sie etwa Folgendes sehen:

```
[INFO] [Reload] aktive Miniserver: 1
[INFO] [DNS] 504F94AB1234 → 504f94ab1234.dns.loxonecloud.com
[INFO] [WS] verbinde 504F94AB1234 → 504f94ab1234.dns.loxonecloud.com
[INFO] [WS] authentifiziert 504F94AB1234 (5 UUIDs)
```

**Herzlichen Glückwunsch!** Die Verbindung steht. Werte kommen jetzt in Echtzeit an.

Drücken Sie wieder **Strg + C**, um die Log-Anzeige zu beenden.

---

## Schritt 11: Im AICONO-Backend den Bridge-Worker-Status sehen (Phase 2)

Der Worker meldet sich jetzt zusätzlich alle 30 Sekunden bei zwei neuen Tabellen in der Datenbank. So sehen wir auf einen Blick, ob er noch lebt und welcher Miniserver verbunden ist.

**So prüfen Sie es:**

1. Öffnen Sie das AICONO-Backend (Lovable-Umgebung) und gehen Sie als Super-Admin auf **View Backend → Tables**.
2. Öffnen Sie die Tabelle **`bridge_workers`**.
3. Sie sollten dort einen Eintrag sehen mit:
   - **`name`** = `hetzner-bridge-test`
   - **`status`** = `online`
   - **`last_heartbeat_at`** = nicht älter als 1 Minute
   - **`version`** = `phase2-skeleton` (oder Ihr Wert aus `WORKER_VERSION`)
4. Öffnen Sie zusätzlich die Tabelle **`bridge_event_log`** und sortieren Sie nach `occurred_at` absteigend. Sie sollten ganz oben Ereignisse sehen wie:
   - `worker_started` – beim Start des Containers
   - `ws_connected` – sobald ein Miniserver verbunden ist
   - `ws_reconnect_scheduled` – nur wenn die Verbindung zwischendurch abreißt

**Wenn in `bridge_workers` nichts erscheint** (oder `last_heartbeat_at` bleibt leer):

- Prüfen Sie in den Docker-Logs (`docker logs --tail 50 loxone-ws-worker`), ob Zeilen wie `[Bridge] heartbeat fehlgeschlagen` auftauchen.
- Häufigste Ursache: Der `GATEWAY_API_KEY` ist falsch oder der Worker erreicht das Backend nicht (z.B. Firewall).
- Zweithäufigste Ursache: `BRIDGE_WORKER_NAME` weicht vom Eintrag in `bridge_workers` ab (Groß-/Kleinschreibung zählt).

> **Warum ist das wichtig?** Genau das war der Grund, warum die alte Worker-Version unbemerkt stehen blieb: Es gab keine zentrale Stelle, an der wir gesehen haben, ob sie noch arbeitet. Jetzt sind beide Tabellen unsere „Lebenszeichen-Kontrolle".

---

## Befehle für später (Stoppen, Neustarten, Löschen)

Sie müssen diese jetzt nicht ausführen, aber merken Sie sich diese Befehle für den Fall, dass Sie etwas ändern möchten:

| Was möchten Sie? | Befehl |
|---|---|
| Programm anhalten (ohne zu löschen) | `docker stop loxone-ws-worker` |
| Programm wieder starten | `docker start loxone-ws-worker` |
| Programm komplett neu starten | `docker restart loxone-ws-worker` |
| Programm und Box löschen | `docker rm -f loxone-ws-worker` |
| Logs anschauen (live) | `docker logs -f loxone-ws-worker` |
| Logs anschauen (letzte 50 Zeilen) | `docker logs --tail 50 loxone-ws-worker` |
| Alle laufenden Boxen anzeigen | `docker ps` |

> **Tipp:** Nachdem Sie den Programm-Code geändert haben (z. B. eine neue Version), müssen Sie erst `docker rm -f loxone-ws-worker` (löschen), dann `docker build -t loxone-ws-worker .` (neu bauen) und dann den `docker run ...`-Befehl aus Schritt 7 nochmal ausführen.

---

## Wenn etwas nicht klappt

### „docker: command not found“

Docker ist nicht installiert. Fragen Sie Ihren Administrator, ob Docker auf dem Server vorhanden ist. Falls nicht, muss er es installieren.

### „FATAL: SUPABASE_URL und GATEWAY_API_KEY müssen gesetzt sein“

Sie haben in Schritt 7 die Platzhalter `[HIER_SUPABASE_URL]` und `[HIER_API_KEY]` nicht durch die richtigen Werte ersetzt. Löschen Sie den Container (`docker rm -f loxone-ws-worker`) und starten Sie bei Schritt 7 nochmal.

### „aktive Miniserver: 0“ bleibt für immer

1. Prüfen Sie im AICONO-Backend, ob der Standort wirklich freigeschaltet ist (Schritt 9).
2. Prüfen Sie, ob in der Loxone-Integration die **Seriennummer, der Benutzername und das Passwort** korrekt eingetragen sind.
3. Warten Sie noch etwas – es kann bis zu 5 Minuten dauern.

### „WS Verbindung fehlgeschlagen“

1. Prüfen Sie, ob der Miniserver überhaupt online ist (können Sie sich normal in die Loxone-App einloggen?).
2. Prüfen Sie, ob Benutzername und Passwort in der Integration stimmen.
3. Prüfen Sie, ob der Miniserver über Remote Connect erreichbar ist (dns.loxonecloud.com).

### Ich habe mich vertippt und weiß nicht, wie ich zurückkomme

Drücken Sie **Strg + C**. Das bricht den aktuellen Befehl ab. Dann können Sie es nochmal versuchen.

---

## Noch Fragen?

Wenn Sie an einer Stelle nicht weiterkommen, machen Sie einen **Screenshot** des Terminal-Fensters und schreiben Sie eine kurze E-Mail an **support@aicono.org** mit dem Betreff „Loxone WS Worker Einrichtung“. Fügen Sie den Screenshot bei.

> **Denken Sie daran:** Sagen Sie uns Bescheid, sobald Sie einen Schritt geschafft haben (z. B. „Schritt 6 ist fertig, das Image wurde gebaut“). So können wir Sie bei Problemen gezielt unterstützen, bevor Sie mit dem nächsten Schritt weitermachen.
