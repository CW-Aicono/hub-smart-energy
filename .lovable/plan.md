

# Keep-Alive Ping entfernen / durch WebSocket Ping ersetzen

## Analyse

In `ocpp-ws-proxy/index.ts` wird alle 20 Sekunden ein leerer Text-Frame gesendet:

```javascript
socket.send(""); // empty frame as keep-alive
```

Das Problem: OCPP-Wallboxen erwarten auf dem WebSocket ausschliesslich gueltige OCPP-JSON-Nachrichten (Arrays mit Message-Type-ID). Ein leerer String ist kein gueltiges JSON. Die DUOSIDA/UCHEN-Firmware versucht vermutlich, diesen Frame zu parsen, scheitert und loest einen Watchdog-Reset aus -- was den beobachteten ~44-Sekunden-Bootloop erklaert.

## Loesung

Den `setInterval`-basierter Keep-Alive komplett entfernen. Er ist nicht noetig, weil:

1. Die Wallbox selbst sendet regelmaessig `BootNotification` / `Heartbeat` (alle 30s laut unserem `interval`-Wert), was die Verbindung am Leben haelt.
2. Edge Functions haben ein Timeout von ca. 150s bei WebSocket-Verbindungen -- die 30s-Heartbeats der Wallbox reichen aus, um die Verbindung innerhalb dieses Fensters aktiv zu halten.

## Aenderungen

**Datei: `supabase/functions/ocpp-ws-proxy/index.ts`**

- Den gesamten `keepAliveTimer`-Block entfernen:
  - Variable `let keepAliveTimer` entfernen
  - `setInterval` im `onopen`-Handler entfernen
  - `clearInterval(keepAliveTimer)` in `onclose` und `onerror` entfernen

## Technische Details

| Datei | Aenderung |
|---|---|
| `supabase/functions/ocpp-ws-proxy/index.ts` | Keep-Alive Timer komplett entfernen |

Nach dem Deployment sollte die Wallbox aufhoeren, in der Bootloop zu haengen. Erwartetes Verhalten danach: ein `BootNotification`, gefolgt von `StatusNotification`, dann regelmaessige `Heartbeats` alle 30 Sekunden.

