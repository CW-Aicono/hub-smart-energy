## Problem

Die Anwendung (`LoxoneWsStatus.tsx`) verwendet für den Stale-Status einen Fallback von **180 Sekunden (3 Minuten)**. Der `loxone-ws-worker` sendet aber laut Dockerfile und Live-Env `BRIDGE_HEARTBEAT_MS=300000` (= **5 Minuten**). Dadurch wird eine funktionierende Verbindung fälschlicherweise als „stale“ angezeigt.

## Ziel

Heartbeat-Erkennung in UI und Worker konsistent auf einen sicheren Wert ausrichten, sodass „stale“ erst nach einem echten Ausfall gemeldet wird.

## Vorgeschlagene Änderungen

### Option A (empfohlen): Worker häufiger heartbeaten lassen

1. `**docs/loxone-ws-worker/index.ts**`
  - `BRIDGE_HEARTBEAT_MS` auf **60.000 ms** (= 1 Minute) setzen.
  - Sicherstellen, dass der Heartbeat wirklich im konfigurierten Intervall gesendet wird (nicht nur alle 5 Min mit Reload).
2. `**docs/loxone-ws-worker/Dockerfile**`
  - `ENV BRIDGE_HEARTBEAT_MS=60000` setzen.
3. **Live-Container**
  - Env `BRIDGE_HEARTBEAT_MS=60000` in `docker-compose.yml`/Systemd-Unit übernehmen und Worker neu starten.
4. **UI-Default**
  - In `LoxoneWsStatus.tsx` den Fallback `180` auf **120 Sekunden** senken, damit ein Ausfall schneller erkannt wird, ohne falsch-positive.

### Option B: UI-Threshold an 5-Min-Worker anpassen (kein Worker-Deploy nötig)

1. `**src/components/integrations/LoxoneWsStatus.tsx**`
  - Fallback `180` auf **360 Sekunden** (6 Minuten) erhöhen.
2. **Super-Admin-Einstellung**
  - Im `WorkerControlsPanel.tsx` (falls vorhanden) Hinweis ergänzen, dass `loxone_ws_stale_threshold_seconds` mindestens so groß sein muss wie `BRIDGE_HEARTBEAT_MS`.

## Empfehlung

**Option A**, weil:

- Ein Heartbeat alle 5 Minuten zu grob ist, um Stale-Zustände schnell zu erkennen.
- Die vorherige Änderung (v1.7) bereits auf 60s Heartbeat abzielte, aber das Dockerfile/Env wurde offenbar nicht mitgezogen.
- `RELOAD_INTERVAL_MS` kann weiterhin 300.000 ms bleiben (Struktur-Neuladung ist unabhängig).

## Abgrenzung

- Keine Änderung an der WebSocket-Datenübertragung selbst.
- Keine Änderung an der `RELOAD_INTERVAL_MS` (5 Min Struktur-Reload bleibt).
- Keine neuen Datenbanktabellen.

## Akzeptanzkriterien

- `LoxoneWsStatus.tsx` zeigt eine Verbindung nicht mehr als „stale“ an, solange der Worker regelmäßig heartbeated.
- Worker-Heartbeat-Intervall ist in Code (Dockerfile) und Live-Env identisch dokumentiert.
- Nach Deploy: Logs zeigen Heartbeat alle 60 Sekunden, keine 5-Min-Lücken mehr.