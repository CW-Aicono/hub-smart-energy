# OCPP-Log kommt nicht mehr an — so schaltest du es wieder ein

**Symptom:** Die Wallboxen sind online (Heartbeat aktuell, Ladevorgänge funktionieren),
aber im Reiter „OCPP-Log" erscheinen keine neuen Zeilen mehr.

**Ursache in diesem Fall:** Der OCPP-Server auf dem Hetzner-Rechner sendet keine
Log-Nachrichten mehr, weil der Schalter `OCPP_FRAME_LOGGING_ENABLED` in seiner
Konfigurationsdatei fehlt oder auf `false` steht. Das Backend selbst ist in Ordnung
(getestet: ein Testeintrag wurde korrekt gespeichert).

---

## ⚠ Wichtig: Auf dem Server laufen ZWEI OCPP-Server

| Umgebung | Domain | Service-Name | Container | Zweck |
|---|---|---|---|---|
| **Test** | `ocpp.aicono.org` | `ocpp` | `ocpp-server` | Testen aus Lovable heraus |
| **Live** | `cp.aicono.org` | `ocpp-live` | `ocpp-server-live` | echte Kunden-Wallboxen |

Beide teilen sich denselben Ordner, aber **jeder hat seine eigene Einstellungsdatei**.
Du musst den Schalter also **in beiden Dateien** setzen.

> **Niemals** `docker compose down` eingeben — das würde beide Umgebungen und den
> Caddy-Proxy gleichzeitig stoppen. Immer nur einzelne Services stoppen/starten.

---

## Schritt 1 — Auf den Server einloggen

Terminal öffnen (Windows: „Windows Terminal", Mac: „Terminal") und eingeben
(IP durch die echte ersetzen):

```bash
ssh root@DEINE.SERVER.IP
```

Passwort eintippen (man sieht dabei nichts — normal), Enter.

## Schritt 2 — In den richtigen Ordner wechseln

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
```

Falls das einen Fehler gibt, den Ordner suchen:

```bash
find / -name "docker-compose.yml" -path "*ocpp*" 2>/dev/null
```

Prüfen, dass du richtig bist:

```bash
ls
```

Du musst `docker-compose.yml` und `Dockerfile` sehen.

## Schritt 3 — Welche Einstellungsdateien gibt es?

```bash
ls -a | grep env
```

Erwartet ungefähr:

```
.env
.env.live
```

- `.env` gehört zur **Test**-Umgebung (`ocpp.aicono.org`)
- `.env.live` gehört zur **Live**-Umgebung (`cp.aicono.org`)

> Falls nur `.env` da ist: dann benutzen beide dieselbe Datei — du machst Schritt 4
> dann nur einmal und überspringst Schritt 5.

## Schritt 4 — Schalter in der TEST-Datei setzen

```bash
nano .env
```

Suche die Zeile `OCPP_FRAME_LOGGING_ENABLED=...`.

- Steht dort `false` → in `true` ändern.
- Gibt es die Zeile nicht → unten neu dazuschreiben:

```
OCPP_FRAME_LOGGING_ENABLED=true
```

Speichern: `Strg` + `O`, dann `Enter`, dann `Strg` + `X`.

## Schritt 5 — Schalter in der LIVE-Datei setzen

```bash
nano .env.live
```

Genau dasselbe wie in Schritt 4 machen und wieder speichern
(`Strg` + `O`, `Enter`, `Strg` + `X`).

## Schritt 6 — Beide Server neu bauen und starten

Nacheinander eingeben, jeweils Enter und warten (dauert 1–3 Minuten pro Befehl):

```bash
docker compose build --no-cache ocpp ocpp-live
```

```bash
docker compose up -d ocpp ocpp-live
```

> ⚠ Live-Wallboxen verlieren dabei für ein paar Sekunden die Verbindung und
> verbinden sich danach automatisch wieder. Deshalb am besten zu ruhigen Zeiten machen.

## Schritt 7 — Prüfen, ob beide laufen

```bash
docker compose ps
```

Erwartet drei Zeilen mit `Up` bzw. `healthy`:

```
ocpp-caddy         Up ...
ocpp-server        Up ... (healthy)
ocpp-server-live   Up ... (healthy)
```

## Schritt 8 — Prüfen, ob das Logging jetzt an ist

Test-Umgebung:

```bash
curl -s https://ocpp.aicono.org/health
```

Live-Umgebung:

```bash
curl -s https://cp.aicono.org/health
```

In **beiden** Antworten muss `"frameLogging":true` stehen, z. B.:

```json
{"status":"ok","uptimeSeconds":12,"sessions":3,"frameLogging":true}
```

## Schritt 9 — In der App nachsehen

1–2 Minuten warten, dann in der App unter
**Ladeinfrastruktur → Ladepunkt → OCPP-Log** schauen.
Es sollten wieder `MeterValues`- und `Heartbeat`-Zeilen erscheinen.

---

## Wenn etwas nicht klappt

| Symptom | Was tun |
|---|---|
| `Restarting` bei einem Container | `docker compose logs --tail=120 ocpp` bzw. `... ocpp-live` ausführen und Ausgabe an David schicken (Zeilen mit `KEY=` / `SECRET=` vorher entfernen) |
| `frameLogging` fehlt in der Antwort | Der Container läuft noch mit altem Code → Schritt 6 wiederholen |
| `curl` antwortet gar nicht | `docker compose restart caddy`, danach nochmal Schritt 8 |
| `permission denied` bei `docker` | `sudo` davorsetzen, z. B. `sudo docker compose ps` |

## Gut zu wissen

- Ab dieser Version ist das Frame-Logging **standardmäßig an**. Fehlt die Zeile in der
  `.env`, wird trotzdem geloggt — der Neubau in Schritt 6 ist dafür aber nötig.
- Zusätzlich gibt es einen Schalter im Backend (`ocpp_message_logging_enabled`) sowie den
  Notfallmodus (`backend_emergency_mode`). Ist der Notfallmodus an, wird das Logging
  bewusst pausiert, um die Datenbank zu schonen.
- In der App erscheint jetzt eine gelbe Warnung im OCPP-Log, wenn länger als 15 Minuten
  keine Nachricht mehr angekommen ist — damit fällt so ein Ausfall sofort auf.
