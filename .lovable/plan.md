## Verifizierter Befund

Der Heartbeat-Fix ist auf dem Hetzner-Server angekommen:

```text
interval: 86400
```

Der neue Log zeigt aber eine andere, jetzt sehr konkrete Ursache:

```text
BootNotification
GetConfiguration wird gesendet
Wallbe antwortet teilweise
WebSocket closed code=1006 nach 1–2 Sekunden
```

Zusätzlich liegt in der Datenbank noch mindestens ein offener Befehl für genau diese Wallbox:

```text
00000001305 | GetConfiguration | pending
```

Das heißt: Die alte Wallbe trennt nicht wegen `interval: 86400`, sondern sehr wahrscheinlich wegen `GetConfiguration` bzw. wegen der Capability-/Live-Daten-Abfrage.

## Plan

### 1. Sofortmaßnahme in der Datenbank

Ich markiere offene `GetConfiguration`-Befehle für `00000001305` als fehlgeschlagen/abgebrochen, damit sie beim nächsten Online-Gehen nicht erneut an die Wallbox gesendet werden.

Betroffen ist nur:

```text
pending_ocpp_commands
charge_point_ocpp_id = 00000001305
command = GetConfiguration
status = pending oder scheduled
```

### 2. OCPP-Server robuster machen

Im OCPP-Server ergänze ich einen Wallbe-Kompatibilitäts-Schutz:

- Bei Wallbe `Smart Charge Control` mit Firmware `BF-01.04.x` wird die automatische Konfigurationsprüfung nach `BootNotification` nicht mehr gestartet.
- Dadurch sendet der Server nach dem Boot keine automatische `GetConfiguration` und keine automatische `ChangeConfiguration` mehr an dieses alte Modell.
- Moderne Wallboxen bleiben unverändert.

### 3. Befehls-Warteschlange absichern

Im Command-Dispatcher ergänze ich eine Sperre:

- Wenn eine bekannte alte Wallbe verbunden ist, werden `GetConfiguration`-Befehle aus der Warteschlange nicht an die Wallbox gesendet.
- Der Befehl wird stattdessen sauber als `rejected`/nicht kompatibel abgeschlossen.
- Dadurch kann auch ein UI-Klick oder ein alter offener Befehl keinen neuen Reboot-/Disconnect-Loop auslösen.

### 4. UI-Auto-Probe deaktivieren

In der Ladepunkt-Detailseite gibt es aktuell eine automatische Prüfung:

```text
wenn Wallbox online und keine Capabilities vorhanden → GetConfiguration senden
```

Diese Automatik entferne oder begrenze ich so, dass sie nicht mehr ungefragt `GetConfiguration` an Wallboxen sendet. Die Prüfung soll nur noch bewusst über den Button „Messgrößen prüfen“ ausgelöst werden — und für alte Wallbe-Modelle zusätzlich blockiert werden.

### 5. Hetzner-Anleitung danach

Nach der Codeänderung brauchst du wieder nur den OCPP-Server auf Hetzner neu bauen:

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server

git fetch --all
git pull

docker compose stop ocpp
docker compose build --no-cache ocpp
docker compose up -d ocpp

docker compose stop ocpp-live
docker compose build --no-cache ocpp-live
docker compose up -d ocpp-live
```

### 6. Erfolgskriterium

Nach dem Neustart darf im Log bei `00000001305` Folgendes nicht mehr erscheinen:

```text
Command dispatched cmd=GetConfiguration
```

Erwartet ist dann:

```text
BootNotification
StatusNotification
kein sofortiger WebSocket close nach GetConfiguration
keine zweite BootNotification nach 10 Minuten
```

## Wichtig

Meine erste Annahme war unvollständig. `interval: 86400` war korrekt, aber der aktuelle Log beweist: Der akute Abbruch passiert direkt nach `GetConfiguration`. Deshalb ist der nächste Fix gezielt ein Wallbe-Kompatibilitätsmodus gegen diese Abfrage.