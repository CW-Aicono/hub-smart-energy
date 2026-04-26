Ich stoppe hier bewusst alle Änderungen. Du hast recht: Der richtige nächste Schritt ist nicht weiter herumprobieren, sondern den vorhandenen Code sauber mit dem Server-Zustand abgleichen und dann genau einen sicheren Weg gehen.

## Was ich aus Code und Chat sicher ableite

### 1. Der Hetzner-Ordner ist bekannt
Der laufende Docker-Container hat selbst verraten, wo sein Projekt liegt:

```text
/opt/aicono/aicono-ems/docs/ocpp-simulator-server
```

Das ist der korrekte Ordner für den Simulator-Container.

### 2. Der aktuell laufende Container ist noch alt
Der ursprüngliche Fehler war:

```text
Edge function returned 404: {"error":"Logs unavailable","details":{"error":"Not found"}}
```

Das passt exakt zu folgendem Zustand:

- Die Lovable-/Cloud-Seite ruft bereits die neue Funktion auf: `GET /sim-api/logs?...`
- Der Hetzner-Container, der gerade läuft, kennt diesen neuen Endpoint noch nicht.
- Deshalb antwortet der Container mit `404 Not found`.

Im neuen Code ist `/logs` bzw. `/sim-api/logs` vorhanden. Im alten Container nicht.

### 3. Mein vorheriger lokaler Healthcheck war falsch eingeordnet
Der Befehl

```bash
curl http://127.0.0.1:8090/health
```

ist auf deinem Server nicht aussagekräftig, weil der Zugriff real über Caddy/Reverse-Proxy und Docker-Netzwerke läuft. Dass dieser lokale Curl fehlschlägt, bedeutet nicht automatisch, dass der Simulator kaputt ist.

### 4. Der echte Blocker ist nicht Docker, sondern Git
Dein `git pull` ist nicht am Simulator gescheitert, sondern an einer lokalen Änderung in:

```text
docs/ocpp-persistent-server/Caddyfile
```

Fehlermeldung:

```text
Your local changes to the following files would be overwritten by merge:
        docs/ocpp-persistent-server/Caddyfile
Aborting
```

Das bedeutet: Git schützt deine Server-Konfiguration. Gut so. Wir dürfen diese Datei nicht blind überschreiben.

### 5. Wichtig: Die Caddyfile ist vermutlich absichtlich lokal angepasst
Im Projekt-Code steht aktuell:

```caddy
handle_path /sim-api/* {
    reverse_proxy ocpp-simulator:8090
}
```

Das kann nur funktionieren, wenn `ocpp-caddy` und `ocpp-simulator` im selben Docker-Netzwerk sind. Dein laufender Container zeigt aber beim Simulator:

```text
PORTS: 8090/tcp
```

Das spricht dafür, dass die tatsächliche Server-Konfiguration anders sein kann als der Repo-Stand. Genau deshalb dürfen wir die lokale `Caddyfile` nicht einfach mit `git pull` überschreiben.

## Sichere Lösung, die wir als nächsten Schritt verwenden

Wir aktualisieren NICHT das ganze Repository per normalem `git pull`, solange Git die lokale Caddyfile blockiert.

Stattdessen machen wir einen kontrollierten, minimalen Weg:

1. Zuerst sichern wir die aktuelle Server-Konfiguration sichtbar als Datei.
2. Dann holen wir nur den aktuellen Git-Stand, ohne die Arbeitsdateien sofort zu überschreiben.
3. Danach ersetzen wir gezielt nur die Simulator-Dateien, die für v1.1 nötig sind.
4. Die lokale `docs/ocpp-persistent-server/Caddyfile` bleibt unangetastet.
5. Danach bauen wir nur den Container `ocpp-simulator` neu.
6. Danach prüfen wir die Version direkt im Container und zusätzlich über die öffentliche `/sim-api/status`-Route.

Damit vermeiden wir genau die Sackgasse: kein blindes Überschreiben der Proxy-Konfiguration, keine unnötige Änderung am OCPP-Server, kein Herumprobieren an Ports.

## Der genaue nächste Ablauf für den Server

Diese Befehle sollten erst ausgeführt werden, wenn du diesen Plan freigibst. Ich gebe sie danach einzeln, Schritt für Schritt, mit erwarteter Ausgabe.

### Schritt A — Lokale Caddyfile sichern

```bash
cp /opt/aicono/aicono-ems/docs/ocpp-persistent-server/Caddyfile /root/Caddyfile.backup-before-simulator-v11
```

Zweck: Falls irgendetwas schiefgeht, haben wir deine aktuell funktionierende Proxy-Konfiguration separat gesichert.

### Schritt B — Git-Stand nur herunterladen, nicht mergen

```bash
git -C /opt/aicono/aicono-ems fetch origin staging
```

Zweck: Wir holen den neuen Code auf den Server, ohne lokale Dateien zu überschreiben.

### Schritt C — Nur Simulator-Dateien gezielt aus dem neuen Git-Stand übernehmen

```bash
git -C /opt/aicono/aicono-ems checkout origin/staging -- docs/ocpp-simulator-server/src/index.ts docs/ocpp-simulator-server/Dockerfile docs/ocpp-simulator-server/package.json docs/ocpp-simulator-server/tsconfig.json docs/ocpp-simulator-server/docker-compose.yml
```

Wichtig: Die `docs/ocpp-persistent-server/Caddyfile` wird dabei nicht angefasst.

### Schritt D — Prüfen, ob der neue Code wirklich auf dem Server liegt

```bash
grep -n "version.*1.1.0\|GET /logs\|/sim-api/logs" /opt/aicono/aicono-ems/docs/ocpp-simulator-server/src/index.ts
```

Erwartet: Zeilen mit `1.1.0` und `/sim-api/logs`.

### Schritt E — Nur Simulator-Container neu bauen

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-simulator-server && docker compose up -d --build ocpp-simulator
```

Zweck: Es wird nur der Simulator neu gebaut, nicht der komplette OCPP-Server.

### Schritt F — Version direkt im Container prüfen

```bash
docker exec ocpp-simulator wget -qO- http://127.0.0.1:8090/health
```

Erwartet:

```json
{"ok":true,"instances":0,"version":"1.1.0"}
```

### Schritt G — Öffentliche Simulator-API prüfen

Dafür brauchen wir den API-Key nicht im Chat auszuschreiben. Auf dem Server liegt er normalerweise in der Simulator-`.env`. Der Befehl kann ihn direkt daraus lesen:

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-simulator-server && . ./.env && curl -sS -H "Authorization: Bearer $SIMULATOR_API_KEY" https://ocpp.aicono.org/sim-api/status
```

Erwartet:

```json
{"instances":[]}
```

oder eine Liste laufender Instanzen.

## Warum diese Lösung im ersten Versuch funktionieren soll

- Sie behebt genau den belegten Fehler: alter Container kennt `/logs` nicht.
- Sie verändert nicht die Caddyfile, die aktuell den funktionierenden Betrieb sichern kann.
- Sie aktualisiert nur die v1.1-Dateien des Simulator-Containers.
- Sie prüft Erfolg zweifach: intern im Container und extern über die Route, die die Cloud-Funktion nutzt.
- Sie vermeidet `git stash pop`, weil das bei Caddyfile-Konflikten wieder neue Probleme erzeugen kann.

## Was ich nicht mehr machen werde

- Kein weiteres Raten an Ports.
- Kein blindes `git pull`, solange lokale Server-Dateien blockieren.
- Kein Ändern der Caddyfile ohne vorherige Sicherung und ohne klaren Beweis, dass es nötig ist.
- Kein dritter Reparaturversuch, falls dieser kontrollierte Weg scheitert; dann wird zuerst ehrlich bewertet, ob die Server-Architektur anders ist als im Repo dokumentiert.

Nach Freigabe führe ich dich exakt durch Schritt A, warte auf deine Ausgabe, dann Schritt B, usw. — immer nur ein Schritt auf einmal.