## Diagnose

Seit dem Live-Update von heute früh enthält der OCPP-Server (`docs/ocpp-persistent-server`) die neue Funktion `probeChargePointConfiguration`. Diese wird in `ocppHandler.ts` **bei jedem BootNotification** (fire-and-forget, 2 s verzögert) aufgerufen und sendet u. a.:

- `ChangeConfiguration` für `MeterValueSampleInterval=30`
- `ChangeConfiguration` für `ClockAlignedDataInterval=60`
- `ChangeConfiguration` für `MeterValuesSampledData=<Profil>` (in 4 Fallback-Stufen)

In `configurationProbe.ts` gilt:

```ts
return result?.status === "Accepted" || result?.status === "RebootRequired";
```

**Das ist die Falle.** Ältere wallbe Smart Charge Control (Firmware BF‑01.04.20) antworten auf diese Keys typischerweise mit `RebootRequired` — und führen den Reboot dann **selbst** durch. Nach dem Reboot kommt ein neues `BootNotification`, der Probe läuft erneut, die Werte werden wieder gesetzt (weil nichts den Soll-Zustand mit dem Ist-Zustand vergleicht), die Wallbox bootet wieder. Daraus entsteht exakt das beobachtete Muster: kurz online → nach wenigen Sekunden weg → ca. alle 10 min derselbe Zyklus.

Edge-Function-Logs sind hier nicht aussagekräftig, weil der OCPP-Server auf Hetzner läuft (`cp.aicono.org`). Die "besseren Logs in Lovable" gibt es nicht — Wallboxen brauchen die persistente WS-Verbindung am Hetzner-Server.

## Fix-Plan (Server-Code, kein UI)

Ziel: Probe darf nicht bei jedem Boot Reconfig-Befehle senden, und niemals einen Reboot auslösen, wenn der gewünschte Wert bereits gesetzt ist.

### 1. `docs/ocpp-persistent-server/src/configurationProbe.ts`

- **Idempotenz**: Vor jedem `ChangeConfiguration` den aktuellen Wert aus `GetConfiguration` lesen (haben wir bereits in `configMap`). Nur senden, wenn `configMap[key].value !== gewünschterWert`. Bei `readonly: true` überspringen.
- **RebootRequired ≠ Erfolg**: Status `RebootRequired` weiterhin als „akzeptiert" werten, aber **nur** wenn der Wert tatsächlich neu war (siehe oben). Zusätzlich `log.warn` mit Hinweis, dass die Wallbox neu starten wird.
- **Einmal-Probe pro Charger**: Vor dem Probe in `charge_point_capabilities.last_probed_at` schauen. Wenn jünger als z. B. 24 h und `supported_measurands` nicht leer → Probe komplett überspringen (nur `upsert` mit aktualisiertem `last_seen` ohne ChangeConfiguration).
- **MeterValuesSampledData-Fallback**: Schleife abbrechen, sobald der bereits aktive Wert dem ersten passenden Profil entspricht (kein Reset auf gleichen Inhalt).

### 2. `docs/ocpp-persistent-server/src/ocppHandler.ts`

- Probe nicht mehr bedingungslos bei jedem `BootNotification` starten. Stattdessen Aufruf nur, wenn `charge_point_capabilities` für diese `chargePointPk` noch nicht existiert oder älter als 24 h ist (Check via neuer Helper in `backendApi.ts`, der die Zeile liest).

### 3. `docs/ocpp-persistent-server/src/backendApi.ts`

- Neue Funktion `getCapabilitiesAge(chargePointPk)` → liest `last_probed_at`. Wird in Punkt 2 verwendet.

### 4. Update-Anleitung

- `docs/ocpp-persistent-server/UPDATE-ANLEITUNG.md` ergänzen: Schritt zum Hotfix-Deploy auf **Live** (`cp.aicono.org`), inkl. `docker compose build --no-cache ocpp-server && docker compose up -d ocpp-server` und Logfile-Check.
- Hinweis: Nach dem ersten erfolgreichen Probe-Lauf laufen beide wallbe-Wallboxen wieder stabil; ein letzter Reboot pro Wallbox ist normal, falls der Sollwert noch nicht stimmt.

## Was wir nicht anfassen

- Keine Änderungen an Cloud-Edge-Functions, UI oder DB-Schema (Tabelle `charge_point_capabilities` existiert bereits).
- Test-Container `ocpp.aicono.org` bleibt unberührt — Fix wird zuerst dort getestet, dann auf Live deployed.

## Antwort auf die Zweitfrage

Eine Wallbox „direkt in Lovable einbinden" bringt **keine besseren Logs** — OCPP-WebSockets können nicht direkt in Supabase Edge Functions terminiert werden (deshalb läuft ja der Hetzner-Server). Bessere Diagnose bekommst du stattdessen über `docker logs -f ocpp-server | jq` auf Hetzner und über die Cloud-Tabelle `ocpp_message_log`.

## Verifikation nach Deploy

1. `docker logs -f ocpp-server` auf Live → kein `MeterValuesSampledData accepted` mehr nach jedem Boot.
2. In Cloud: `select charge_point_id, last_heartbeat, ws_connected from charge_points where ocpp_id in ('00000000683', …)` → Heartbeats alle ~30 s ohne 10-Minuten-Lücken.
3. `select * from ocpp_message_log order by created_at desc limit 50` → kein wiederkehrendes `ChangeConfiguration` mehr.
