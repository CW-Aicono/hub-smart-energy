# Worker-Polling-Härtung: Intervalle & Backoff für Loxone-Bridge

## Ziel
Die externen Loxone-WebSocket-Worker sollen bei kurzzeitigen Backend-Ausfällen oder 5xx-Fehlern nicht mit voller Frequenz weiter gegen das Backend pollen, sondern einen exponentiellen Backoff einlegen und sensible Intervalle dehnen. Dadurch verkürzt sich die Erholungsphase nach einem Gateway/Pooler-Problem.

## Was die beiden Komponenten heute tun

### `bridge_workers` (Tabelle)
- Zentrale Registrierung der externen Loxone-WS-Worker (z. B. Hetzner-Bridge).
- Jeder Worker meldet sich mit `name`, `version`, `host`, `status` und `last_heartbeat_at`.
- Der Edge Function `gateway-worker-status` liest daraus, ob der Worker aktiv/fresh ist.
- Der Shared-Helper `isWorkerPrimary` entscheidet, ob der HTTP-Pull-Pfad für Loxone aussetzen soll, weil der WS-Worker die Daten bereits schreibt.
- Standard-Heartbeat-Intervall im Worker: **60 s** (`BRIDGE_HEARTBEAT_MS`, konfigurierbar per Env).

### `loxone_pending_writes` (Tabelle)
- Warteschlange für Befehle/Werte, die von der Cloud an die lokale Loxone-Miniserver geschoben werden sollen.
- Quellen: `loxone-parameter-push` (Arbitrage, Peak-Shaving, Community, CO2) und die UI-Automation (`src/pages/Automation.tsx`).
- Der Worker ruft alle paar Sekunden `gateway-ingest?action=list-pending-writes` ab und sendet die Werte über die bestehende WS-Verbindung an den Miniserver.
- Standard-Poll-Intervall im Worker: **5 s**.
- Bestätigung/Erfolg/Misserfolg läuft über `gateway-ingest?action=ack-pending-write`.

## Aktuelles Problem
- `processPendingWrites` pollt unabhängig vom Backend-Zustand alle 5 s.
- `bridgeHeartbeat` pollt unabhängig vom Backend-Zustand alle 60 s.
- Beide `ingestGet`/`ingestPost`-Helper werfen bei 5xx/Timeouts zwar Fehler, es gibt aber **keinen Backoff**: der nächste Tick kommt pünktlich nach 5 s bzw. 60 s.
- Bei einem Pooler/Auth-Ausfall (wie heute) erzeugt das unnötige Last und verzögert die Erholung.

## Geplante Änderungen

### 1. Worker-seitiger Backoff (`docs/loxone-ws-worker/index.ts`)
- Zustandsvariable `backendHealthy: boolean` + `consecutiveFailures: number` pro Kommunikationspfad.
- Bei 5xx/Timeout/Network-Fehler: `consecutiveFailures++`.
- Bei Erfolg: `consecutiveFailures = 0`.
- Dynamisches Intervall für `processPendingWrites`:
  - Basis 5 s
  - Backoff-Faktor `min(2^failures, 8)` → max. 40 s
- Dynamisches Intervall für `bridgeHeartbeat`:
  - Basis 60 s
  - Backoff-Faktor `min(2^failures, 4)` → max. 240 s
- Kein Backoff bei 4xx Client-Fehlern (z. B. falscher API-Key), denn diese verschwinden nicht durch Warten.

### 2. Edge-Function-Härtung (`supabase/functions/gateway-ingest/index.ts`)
- `list-pending-writes` und `bridge-heartbeat` schnell beantworten (keine schweren Joins).
- Optional: 503-Response mit `Retry-After`-Header, damit der Worker sofort in den Backoff geht.
- Logging der 5xx-Rate, damit wir im Super-Admin sehen, wenn ein Worker "drescht".

### 3. Zustandslose Retries bei `ack-pending-write`
- Heute: Fehler erhöht `attempts` bis `max_attempts`, dann Status `failed`.
- Zusätzlich: bei 5xx/Timeout **nicht** als `failed` zählen, sondern nur bei Anwendungsfehlern (z. B. ungültige UUID). Damit werden Befehle nicht wegen eines vorübergehenden Backend-Problems verworfen.

### 4. Konfiguration & Monitoring
- Neue Env-Variablen im Worker dokumentieren:
  - `PENDING_WRITES_BASE_MS` (Default 5000)
  - `PENDING_WRITES_MAX_BACKOFF_MS` (Default 40000)
  - `BRIDGE_HEARTBEAT_BASE_MS` (Default 60000)
  - `BRIDGE_HEARTBEAT_MAX_BACKOFF_MS` (Default 240000)
- Super-Admin-Statuskachel zeigt `last_heartbeat_age` und ggf. "Backoff aktiv" an.

### 5. Test & Rollout
- Lokalen Worker gegen ein temporär blockiertes `gateway-ingest` testen (z. B. falsches API-Key → 401, Backend-Timeout → 503).
- Logs prüfen: exponentielles Wachstum der Poll-Intervalle muss sichtbar sein.
- Nach Deploy: 15 Minuten Beobachtung der `bridge_workers`-Heartbeat-Linie.

## Nicht im Scope
- Keine Änderung an der Business-Logik der Automation oder der Arbitrage-Strategien.
- Keine Änderung am DB-Schema (`bridge_workers`, `loxone_pending_writes` bleiben unverändert).
- Keine Änderung an anderen Gateways (AICONO-Gateway, Shelly, Schneider etc.).
