

## Bender / Nidec Disconnect — Korrekte Ursachenanalyse

### Was die echten Logs zeigen

Tenant ESB hat **NIDAC000003 (Nidec)**, keinen Bender. Reconnect-Pattern aus den Edge-Logs:

| Ladepunkt | Reconnects | Intervall |
|-----------|------------|-----------|
| CoCSAG773 | 09:28:18 → 09:31:49 → 09:31:49+ | ~3:30 min |
| 0311303102122250589 | 09:28:31 → 09:31:52 → 09:35:14 | ~3:20 min |
| NIDAC000003 (Nidec) | 09:01:41 → 09:01:42 → 09:15:45 → 09:30:35 | 14 min, dann silent |

**Alle drei** Ladepunkte trennen regelmäßig — nicht nur der Bender. Die OCPP-Heartbeats (alle 30s) und StatusNotifications laufen weiterhin sauber, aber die **WebSocket-Verbindung wird vom Server beendet**, nicht vom Charger. Das eliminiert die Bender-spezifische Hypothese.

### Wahre Ursache

**Supabase Edge Functions (Deno Deploy) erzwingen ein Worker-Recycling**. Jede Edge-Function-Invocation hat eine maximale Lebensdauer (im freien Tier ca. 150 Sekunden CPU-Zeit, im Pro-Tier länger, aber nie unbegrenzt). Bei `Deno.upgradeWebSocket` läuft die Funktion **so lange wie die WebSocket-Verbindung**. Sobald die Worker-Lifetime erreicht ist oder der Worker recycelt wird (Deployment, Scale-Down), wird der Socket geschlossen.

Zusätzlich:
1. **`idleTimeout` Default = 120s**: Wenn zwischen zwei Frames mehr als 120s vergehen (Heartbeat ist alle 30s — knapp drunter, aber bei Jitter über die Schwelle), schließt Deno selbst.
2. **Kein WebSocket-Ping/Pong Server-seitig**: Manche Charger (insbes. Bender, Compleo, Nidec) erwarten Pong-Antworten auf eigene Ping-Frames innerhalb 60–120s. Bleibt das Pong aus, bricht der Charger zusätzlich ab.
3. **`pendingCalls` und `commandPollTimer`** überleben den Reconnect nicht — bei Wiederaufbau ist der State weg, was bei `RemoteStartTransaction` zu inkonsistenten States führen kann.

Die Architektur "OCPP-WebSocket via Supabase Edge Function" ist **nicht für langlebige WebSockets gedacht**. Edge Functions sind serverless und für kurze Request/Response-Zyklen optimiert.

### Empfohlener Fix (zwei Stufen)

**Stufe 1 — Sofortmaßnahme im bestehenden Proxy (mildert die Symptome):**

Änderungen in `supabase/functions/ocpp-ws-proxy/index.ts`:

1. **`idleTimeout` explizit hochsetzen**:
   ```ts
   const { socket, response } = Deno.upgradeWebSocket(req, {
     protocol: OCPP_SUBPROTOCOL,
     idleTimeout: 240, // statt default 120s
   });
   ```

2. **Keep-Alive durch Server-seitige Ping-Frames** alle 25s (Deno's WebSocket unterstützt `.ping()` ab v1.40):
   ```ts
   const pingTimer = setInterval(() => {
     if (socket.readyState === WebSocket.OPEN) {
       try { (socket as any).ping?.(); } catch {}
     }
   }, 25_000);
   ```
   Cleanup analog zu `commandPollTimer` in `onclose`/`onerror`.

3. **Pong-Empfang loggen** zur Verifikation der Keep-Alive-Frames.

**Erwartung:** Reconnects werden seltener (von ~3 min auf >5 min), aber **nicht eliminiert** — die Edge-Function-Worker-Lifetime bleibt die harte Grenze.

**Stufe 2 — Architektur-Empfehlung (eigentliche Lösung):**

Für stabile, langlebige OCPP-Verbindungen sollte der WebSocket-Endpunkt **nicht** auf Supabase Edge Functions laufen. Optionen:

- **Variante A:** Eigener Node.js/Deno-Service auf Hetzner/Fly.io (`ws://aicono-ocpp.<domain>:8080`), der die OCPP-Verbindung dauerhaft hält und Nachrichten in Supabase persistiert. Der bestehende `docs/ocpp-cloud-proxy/index.ts` ist genau dafür gedacht — er muss nur dauerhaft auf einem Server laufen statt Lovable Cloud Functions zu fronten.
- **Variante B:** Supabase Realtime-Channels für Backend↔Charger umstellen (kein OCPP-Standard, erfordert Charger-seitige Adaption — nicht praktikabel für Bender/Nidec/Compleo).

### Verifikation nach Stufe-1-Fix

1. Edge-Logs `Socket open for ...` Counter beobachten: Reconnect-Frequenz muss messbar sinken.
2. `ocpp_message_log` für NIDAC000003: Lücken zwischen Heartbeats sollten nicht > 60s werden.
3. Falls weiter Disconnects: Stufe 2 empfehlen.

### Betroffene Datei (Stufe 1)

- `supabase/functions/ocpp-ws-proxy/index.ts` (3 Stellen: `upgradeWebSocket`-Optionen, Ping-Timer in `onopen`, Cleanup in `onclose`/`onerror`)

Keine Datenbank-Änderungen, keine Frontend-Änderungen.

