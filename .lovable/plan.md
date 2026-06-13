## Problem

`last_ws_pong_at` bleibt NULL, obwohl Ost 1 auf Test mit `ws_connected=true` läuft und Heartbeat aktuell ist. Zwei Ursachen denkbar:

1. **Compleo (und einige andere Wallbox-Stacks) antworten nicht auf WS-Pings** — das ist firmware-abhängig und nicht reparierbar von unserer Seite.
2. Etwaige DB-Fehler im Pong-Handler werden mit `log.debug` geschluckt — wir sehen nichts.

Pong als Liveness-Quelle ist damit unzuverlässig — genau für die Geräte (Compleo), für die wir die Anzeige eigentlich gebaut haben.

## Lösung: serverseitiger Liveness-Tick statt Charger-Pong

Statt darauf zu warten, dass der Charger pongt, schreiben wir `last_ws_pong_at` **selbst**, sobald wir wissen, dass der WebSocket noch offen ist. Der OCPP-Server pingt ohnehin alle 30 s — wenn der Socket beim nächsten Ping noch `OPEN` ist und im Intervall davor kein TCP-Reset / `close` kam, ist die Verbindung technisch live.

### Änderung 1: `docs/ocpp-persistent-server/src/keepAlive.ts`

`startPing` bekommt den `chargePointPk` und schreibt direkt vor jedem `ws.ping()`, wenn `ws.readyState === OPEN`, `last_ws_pong_at = now()` per `updateChargePoint(...)` (fire-and-forget, aber Fehler als `log.warn` statt `log.debug`, damit wir sie diesmal sehen). Das gibt im UI alle 30 s ein frisches Liveness-Signal — komplett unabhängig davon, ob der Charger pongt.

Zusätzlich bleibt der bestehende `ws.on("pong")`-Handler erhalten (für Charger, die pongen, ist es ein noch direkteres Signal). Er bleibt fire-and-forget, aber Fehler loggen wir ebenfalls als `log.warn`.

### Änderung 2: Diagnostik

`log.debug("pong", ...)` → `log.info` (einmalig pro Session reicht, damit wir bei künftigem Debug einfach sehen können, ob ein Charger pongt). Anschließend wieder zurück auf debug, sobald die Sache stabil ist.

## UI-Konsequenzen

Keine. `last_ws_pong_at` bleibt das Feld, das `ConnectorStatusGrid` und `isChargePointOnline()` bereits konsumieren. Bedeutung ändert sich semantisch leicht von „Charger hat gepongt" zu „WebSocket war vor X s noch offen" — was für die Anzeige „Verbindung aktiv" genau richtig ist.

## Roll-out

1. Code-Änderung in `keepAlive.ts` + `index.ts`.
2. Veröffentlichen in Lovable.
3. **Auf Hetzner einmaliger Putty-Befehl** (Test + Live neu bauen):
   ```bash
   cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server && \
   git pull && docker compose up -d --build ocpp ocpp-live
   ```
4. Validierung nach 1 Minute: in Lovable
   ```sql
   SELECT name, ws_connected, last_ws_pong_at, now()-last_ws_pong_at AS pong_age
   FROM charge_points WHERE ws_connected = true;
   ```
   `pong_age` muss < 1 Minute sein.
5. Hard-Reload im Browser → Connector-Kacheln zeigen „Verbindung aktiv · Ping vor < 30 Sekunden" in Grün.

## Was wir bewusst nicht tun

- Wir prüfen den Live-Hetzner-Supabase nicht von hier aus — falls die Spalte `last_ws_pong_at` dort fehlt, würde Schritt 3 mit einem PostgREST-Schemafehler crashen. Deshalb wird im selben Putty-Block vor dem Rebuild verifiziert/migriert (eigener kleiner SQL-Snippet liefere ich mit, wenn du den Plan annimmst).

## Zur Pong-Sichtbarkeit im OCPP-Log

WebSocket-Ping/Pong sind **Control-Frames auf Protokoll-Ebene unter OCPP** — sie sind keine OCPP-Nachrichten und tauchen im `ocpp_message_log` deshalb korrekterweise **nicht** auf. Das ist by-design und wird sich nicht ändern. Sichtbar sind sie nur in den OCPP-Server-Logs (`docker logs ocpp-server-live | grep -i pong`).
