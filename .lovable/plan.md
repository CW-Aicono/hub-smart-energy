# Wallbe BF-01.04.20 Reboot-Loop: Revidierte Diagnose nach Monta-Vergleich

## Was der Monta-Log eindeutig zeigt

Monta spricht mit **derselben** Wallbe-Firmware (BF-01.04.20) erfolgreich. Auffälligkeiten gegenüber unserem Server:

1. **BootNotification-Antwort von Monta:**
   ```
   {"currentTime":"...","interval":86400,"status":"Accepted"}
   ```
   → Heartbeat-Intervall **86 400 s (= 24 h)**.
   Unser Server antwortet derzeit mit `"interval": 30` (30 s).

2. **Monta sendet GetConfiguration** sogar mehrfach nach dem Boot (mit konkreten Key-Listen) — die Wallbe **rebootet trotzdem nicht**. Der Reboot-Loop bei uns liegt also **nicht** an `GetConfiguration` selbst.

3. Monta sendet danach ganz normale OCPP-Frames (`TriggerMessage`, `SetChargingProfile`, `MeterValues`-Empfang, `Authorize`, `StartTransaction` usw.) — alles funktioniert.

4. Nach dem Boot sieht man bei Monta exakt **eine** weitere BootNotification (Reconnect nach ~1 min, FW-typisch) und dann **stundenlang Ruhe** — kein 10-Minuten-Loop.

## Daraus folgt die echte Ursache

Die Wallbe BF-01.04.20 verkraftet das von uns gesetzte Heartbeat-Intervall von **30 s** offenbar nicht: Sie sendet zwischen den Boots **gar keine** Heartbeats (in unseren DB-Logs nachweisbar — 10 Minuten Funkstille zwischen jeder BootNotification), läuft intern in einen Watchdog und rebootet.

Monta gibt `interval: 86400` und die Wallbe ist zufrieden.

Der bisher angenommene „Probe-/ChangeConfiguration-Loop" ist **nicht** die Ursache. Unser Hotfix hat das bereits korrekt entschärft (kein ChangeConfiguration mehr in den Logs).

## Fix-Plan (eine minimale Änderung)

### Einzige Änderung: BootNotification-Intervall auf 86 400 setzen

In `docs/ocpp-persistent-server/src/ocppHandler.ts`, Case `BootNotification`:

```ts
return callResult(messageId, {
  currentTime: new Date().toISOString(),
  interval: 86400,        // statt 30 — wie Monta. Wallbe BF-01.04.x bracht das.
  status: "Accepted",
});
```

Das ist eine reine Server-Antwort (kein ChangeConfiguration, kein Reboot-Risiko). Wirkt für **alle** Wallboxen identisch — `interval` ist nur eine Obergrenze für Heartbeats; jede saubere Wallbox sendet ohnehin nur dann Heartbeats, wenn sonst keine OCPP-Frames fließen. Unser `idleTimeoutSec=120` bleibt davon unberührt (WebSocket-Pings laufen ja weiter alle 25 s und halten die TCP-Verbindung wach).

### Was zusätzlich angepasst wird (Folgekorrektur, kein neuer Fix)

Damit der bestehende `PROBE_TTL`-Schutz beim nächsten echten Lauf nicht wieder umsonst greift, wird die Payload-Inkompatibilität in der Edge-Function `ocpp-persistent-api` (Case `upsert-capabilities`) korrigiert:

- aktuell liest die Funktion `body.supportedMeasurands`, `body.rawConfig` flach
- der OCPP-Server sendet sie verschachtelt als `body.capabilities.supported_measurands`, `body.capabilities.configuration` usw.

→ Edge-Function so anpassen, dass sie beide Varianten akzeptiert und `last_probed_at = now()` immer schreibt. Damit greift der bestehende 24-h-Skip wirklich. (Keine Verhaltensänderung für andere Modelle.)

### Was NICHT geändert wird

- Keine wallbe-spezifischen Sonderpfade (`vendor === "wallbe"`).
- Keine Änderung an `GetConfiguration` / `ChangeConfiguration` (funktioniert nachweislich auch unter Monta).
- Keine Änderungen an Ping-/Idle-Logik.
- Keine PWA-Änderungen.

## Deployment

- Edge-Function `ocpp-persistent-api`: deployt Lovable Cloud automatisch.
- OCPP-Server (`docs/ocpp-persistent-server`): muss auf Hetzner für **beide** Container (`ocpp` und `ocpp-live`) neu gebaut werden — gleiche Schritte wie im bestehenden `HOTFIX_WALLBOX_REBOOT_LOOP.md`. Ich ergänze das Dokument um einen Absatz „Nachtrag 2: BootNotification interval auf 86400".

## Erwartetes Verhalten nach Deploy

- Wallbe sendet BootNotification → bekommt `interval: 86400` → bleibt verbunden, sendet bei Bedarf Heartbeats, kein Reboot mehr alle 10 Minuten, Ladevorgang per RemoteStart wieder möglich.
- Alle anderen Modelle: unverändert (sie senden weiterhin so oft, wie sie wollen, und liefern MeterValues; das hohe Intervall ist nur ein zulässiger Maximalwert).
