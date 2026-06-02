# OCPP-Server Update — TEST-Umgebung (ocpp.aicono.org)

> **Wichtig:** Diese Anleitung gilt **nur für den Test-Container** auf Hetzner (`ocpp.aicono.org`).
> Der Live-Container (`cp.aicono.org`) wird **nicht** angefasst.

## Was wird ausgerollt?

Das Update bringt drei neue Funktionen:

1. **MeterValues-Parsing** — eingehende OCPP-MeterValues werden in die Cloud-Tabelle `ocpp_meter_samples` geschrieben (Leistung, Spannung, Strom, Zählerstand).
2. **Capability-Discovery** — nach jedem `BootNotification` ruft der Server automatisch `GetConfiguration` ab und stellt fest, welche Measurands die Wallbox unterstützt.
3. **Automatische Aktivierung** — der Server setzt sinnvolle Defaults (`MeterValueSampleInterval=30`, `ClockAlignedDataInterval=60`, größtmögliches Measurand-Set mit Fallback).

## Voraussetzungen

- Du bist als **root** auf dem Hetzner-Server eingeloggt.
- Du kennst den Pfad zum Test-Repo (typischerweise `/opt/aicono/aicono-ems`).

## Schritt 1 — In das Test-Verzeichnis wechseln

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
```

Falls der Pfad bei dir anders ist, finde ihn so:

```bash
find / -path "*ocpp-persistent-server/docker-compose.yml" 2>/dev/null
```

> **Achtung:** Nicht `cp-persistent-server` oder ähnliches öffnen — wir wollen explizit **ocpp**, also den Test.

## Schritt 2 — Aktuelle Containername prüfen (sicherheitshalber)

```bash
docker compose ps
```

Es sollte ein Container namens `ocpp-server` (oder `ocpp`) und `ocpp-caddy` laufen. Wenn dort `cp-server` o. ä. steht, **abbrechen** — du bist im falschen Verzeichnis.

## Schritt 3 — Neueste Code-Version holen

```bash
git fetch --all
git pull
```

→ Du solltest u. a. diese geänderten/neuen Dateien sehen:
```
docs/ocpp-persistent-server/src/configurationProbe.ts   (NEU)
docs/ocpp-persistent-server/src/ocppHandler.ts          (geändert)
docs/ocpp-persistent-server/src/backendApi.ts           (geändert)
docs/ocpp-persistent-server/src/commandDispatcher.ts    (geändert)
docs/ocpp-persistent-server/src/chargePointRegistry.ts  (geändert)
```

## Schritt 4 — Container neu bauen und starten

```bash
docker compose build ocpp
docker compose up -d ocpp
```

→ Dauer: 1–2 Minuten. Caddy musst du nicht neu starten.

## Schritt 5 — Prüfen, dass der Container läuft

```bash
docker compose ps ocpp
docker compose logs --tail=80 ocpp
```

→ Erwartet: Status `Up`, in den Logs steht `OCPP server started`.

## Schritt 6 — Test: Wallbox „Ost 1" (Duosida) prüfen

Die Duosida ist bereits auf `wss://ocpp.aicono.org/<seriennummer>` gepointet. Warte 60 Sekunden, dann:

```bash
docker compose logs --tail=200 ocpp | grep -E "BootNotification|GetConfiguration|MeterValuesSampledData|MeterValues"
```

**Was du sehen solltest:**
- `BootNotification` (bei nächstem Reboot der Wallbox)
- `MeterValuesSampledData accepted` mit dem Profil, das die Wallbox akzeptiert hat
- Alle 30 Sekunden eintreffende `MeterValues`-Frames

**Wenn nichts passiert:** Die Duosida hat nach dem alten BootNotification keinen Probe ausgelöst. Lösung: Wallbox einmal kurz vom Strom trennen und wieder anschließen.

## Schritt 7 — Daten in der Cloud prüfen

In der Lovable-App → **Super Admin → Wallboxen → Ost 1 → Tab „Live-Daten"** (kommt in Schritt 4 der UI-Umsetzung). Bis dahin direkt in der DB:

In Lovable-Chat schreiben:
> Bitte prüfe `ocpp_meter_samples` für Charge-Point `4016aacc-e9a6-469a-88b6-68d4680ebb0c` der letzten 5 Minuten.

## Bei Problemen — Rollback

```bash
cd /opt/aicono/aicono-ems
git log --oneline -5
git checkout <vorheriger-commit-hash> -- docs/ocpp-persistent-server
cd docs/ocpp-persistent-server
docker compose build ocpp && docker compose up -d ocpp
```

→ Die Test-Wallbox läuft danach wie vorher.

## Live-Server (cp.aicono.org) — NICHT jetzt

Wenn der Test 24–48 h stabil läuft und die Daten in `ocpp_meter_samples` sauber ankommen, geben wir Bescheid. **Erst dann** wird die identische Update-Anleitung für `/opt/aicono/aicono-ems-live` (oder wo dein `cp`-Container liegt) ausgeführt.
