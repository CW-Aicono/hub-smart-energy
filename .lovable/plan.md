
# Tiefendiagnose & Behebung Simulator-Verbindung

## Ehrliche Bestandsaufnahme

Sie haben recht: Der OCPP-Persistent-Server auf Hetzner hat noch **nie** eine echte Wallbox bedient. Echte Wallboxen laufen aktuell über die alte `ocpp-ws-proxy` Edge Function. Die Annahme „WSS funktioniert ja schon" war falsch.

**Was bereits bewiesen ist:**
- ✅ Caddy → Simulator (HTTP 200 auf `/sim-api/health`)
- ✅ Edge Function → Caddy → Simulator (Simulator-Einträge werden angelegt)
- ✅ Container starten sauber

**Was nicht bewiesen ist:**
- ❌ Simulator → Persistent-Server WebSocket-Upgrade
- ❌ Persistent-Server akzeptiert die `ocpp_id` der Sim-Box
- ❌ Authentifizierungs-Logik passt zwischen Edge Function (Anlegen) und Persistent-Server (Akzeptieren)

## Vermutete Ursache (begründet)

In `auth.ts` ruft der Persistent-Server `authenticateChargePoint(ocppId, authorization)` auf. Wenn die Edge Function `ocpp-simulator-control` beim `start` den `charge_points`-Eintrag mit `auth_required = true` erstellt, der Simulator aber **kein Passwort** schickt (Standardfall im UI), wird der WebSocket-Upgrade mit **HTTP 401** abgelehnt → Simulator-Container loggt „WebSocket closed code 1006".

Das ist nicht geraten – das ergibt sich direkt aus dem Code.

## Schritt 1: Beweise sammeln (3 Befehle, 30 Sekunden)

Sie kopieren diese drei Befehle einzeln. Die Ausgaben zeigen exakt, wo es klemmt:

```bash
docker logs --tail 100 ocpp-simulator 2>&1 | grep -E "WebSocket|error|connect"
```
→ Zeigt, mit welcher URL und welchem Auth-Header der Simulator sich verbindet, und welchen Close-Code er bekommt.

```bash
docker logs --tail 100 ocpp-server 2>&1 | grep -E "upgrade|Unauthorized|WebSocket|chargePointId"
```
→ Zeigt, ob der Persistent-Server den Upgrade-Versuch überhaupt sieht und mit welchem Status er antwortet.

Plus ein Datenbank-Check (mache ich selbst über das Backend):
- Welche `auth_required`-Einstellung hat der zuletzt angelegte Sim-Charge-Point?
- Existiert der `ocpp_id`-Eintrag überhaupt?

## Schritt 2: Gezielte Korrektur (eine von drei Möglichkeiten)

Je nach Befund:

**A) Wenn 401 Unauthorized:** Edge Function so ändern, dass Sim-Charge-Points immer mit `auth_required = false` angelegt werden (Sim-Boxen brauchen kein Passwort).

**B) Wenn 404/charge_point not found:** Race-Condition zwischen DB-Insert und Simulator-Start fixen – Edge Function muss vor dem `/sim-api/start`-Aufruf verifizieren, dass der `charge_points`-Eintrag committed ist.

**C) Wenn Persistent-Server crasht:** Konkreten Stack-Trace aus den Logs anzeigen und Bugfix im Persistent-Server-Code.

## Schritt 3: Verifikation

Neuer Sim anlegen → erwartetes Ergebnis:
- Simulator-Container-Log: `WebSocket open` + `OCPP -> server BootNotification`
- Persistent-Server-Log: `WebSocket open` + `recv BootNotification` + `send Accepted`
- UI-Status: `online` innerhalb von 2 Sekunden

## Was ich **nicht** mache

- Keine spekulativen Änderungen ohne Logs
- Keine „probieren wir mal X"-Versuche
- Wenn Schritt 2 nicht innerhalb des ersten Versuchs greift → **Stopp** und ehrliche Aussage, ob das Konzept überhaupt tragfähig ist

## Aufwand

- Ihr Aufwand: 2 Befehle copy-paste, ca. 1 Minute
- Mein Aufwand: 1 gezielte Code-Änderung in der Edge Function oder im Persistent-Server, ca. 5 Minuten
- Risiko, dass es danach immer noch nicht geht: gering, weil die Diagnose den Fehler eindeutig lokalisiert
