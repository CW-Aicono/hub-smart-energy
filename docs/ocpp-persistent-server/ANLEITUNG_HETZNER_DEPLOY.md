# Anleitung: OCPP-Server auf Hetzner deployen (laienfreundlich)

Diese Anleitung führt dich Klick für Klick durch das komplette Deployment des persistenten OCPP-Servers. **Du brauchst keine Linux-Vorkenntnisse.** Plane ca. 60–90 Minuten ein.

> Während des Deployments stehe ich aktiv bereit. Schicke mir bei jedem Schritt einfach den Output, wenn etwas unklar ist.

---

## Schritt 1 — Hetzner-Konto anlegen

1. Öffne https://www.hetzner.com/cloud
2. Klicke oben rechts auf **„Login“ → „Anmelden“ → „Konto erstellen“**.
3. E-Mail-Adresse, Passwort, Bezahlmethode (Kreditkarte oder SEPA-Lastschrift) eingeben.
4. Hetzner verifiziert dein Konto binnen weniger Minuten per E-Mail.

---

## Schritt 2 — Server (Cloud-VPS) erstellen

1. Nach dem Login: links auf **„Cloud“** klicken.
2. Oben rechts auf **„+ Neues Projekt“**, Name z. B. `aicono-ocpp`. Projekt öffnen.
3. Auf **„Server hinzufügen“** klicken. Wähle:
   - **Standort:** Nürnberg (NBG1) — niedrigste Latenz für DACH
   - **Image:** Ubuntu 24.04
   - **Typ:** **CX22** (2 vCPU, 4 GB RAM, ca. 4 €/Monat) — ausreichend für hunderte Wallboxen
   - **Netzwerk:** IPv4 + IPv6 aktivieren
   - **SSH-Key:** Wenn du keinen hast → wähle **„Kein SSH-Key“**, das System schickt dir das Root-Passwort per E-Mail. (Fortgeschrittene: SSH-Key hochladen.)
   - **Name:** `ocpp-server`
4. **„Server erstellen“** klicken. Notiere die **IPv4-Adresse** (z. B. `116.203.XX.XX`).

---

## Schritt 3 — Domain vorbereiten (DNS A-Record bei Cloudflare)

Wichtig in deinem Setup: Die Domain `aicono.org` ist bei **IONOS** registriert, die DNS-Verwaltung läuft aber über **Cloudflare**. A-Records müssen daher **bei Cloudflare** angelegt werden, nicht bei IONOS.

> Voraussetzung: Bei IONOS sind in den Domain-Einstellungen die **Cloudflare-Nameserver** hinterlegt (z. B. `xxx.ns.cloudflare.com` + `yyy.ns.cloudflare.com`). Das ist bei dir bereits der Fall — IONOS dient nur noch als Registrar, alle DNS-Änderungen wirken über Cloudflare.

### Schritt 3.1 — A-Record in Cloudflare anlegen

1. Login auf https://dash.cloudflare.com → Domain **`aicono.org`** auswählen.
2. Links im Menü **„DNS“ → „Records“** öffnen.
3. **„Add record“** klicken und ausfüllen:
   - **Type:** `A`
   - **Name:** `ocpp` (Cloudflare ergänzt automatisch zu `ocpp.aicono.org`)
   - **IPv4 address:** die IPv4 deines Hetzner-Servers (z. B. `116.203.XX.XX`)
   - **Proxy status:** **DNS only** (graue Wolke, **nicht** orange!) — sehr wichtig, sonst blockiert Cloudflare den WebSocket-Verkehr und Caddy bekommt kein Let's-Encrypt-Zertifikat
   - **TTL:** `Auto`
4. **„Save“** klicken.

### Schritt 3.2 — Test

DNS-Propagation dauert in Cloudflare meist nur 1–2 Minuten. Test im Terminal:

```bash
nslookup ocpp.aicono.org
# Erwartete Antwort: Address: <deine Hetzner-IP>
```

Wenn stattdessen eine `104.x.x.x`- oder `172.x.x.x`-Adresse erscheint, steht die Wolke noch auf **Proxied (orange)** — in Cloudflare auf **DNS only (grau)** umstellen.

### Bei IONOS ist nichts zu tun

Solange die Cloudflare-Nameserver bei IONOS aktiv sind, ignoriert IONOS jegliche dort eingetragenen A-Records. Lege A-Records also **niemals bei IONOS** zusätzlich an — das verwirrt nur.

---

## Schritt 4 — Erste Anmeldung am Server

### Mac / Linux
Terminal öffnen und eingeben:
```bash
ssh root@DEINE-IP
```
Passwort aus der Hetzner-Mail eingeben. Beim ersten Login fragt das System nach einem neuen Passwort — **gut merken!**

### Windows
1. Lade **Windows Terminal** aus dem Microsoft Store (oder benutze PuTTY).
2. Im Terminal:
   ```powershell
   ssh root@DEINE-IP
   ```
3. Passwort + neues Passwort wie oben.

Du bist jetzt auf dem Server. Der Prompt sieht so aus: `root@ocpp-server:~#`

---

## Schritt 5 — Setup-Skript (Docker, Firewall, Fail2Ban)

Kopiere die nächsten 4 Zeilen in einem Stück in dein Terminal und drücke Enter:

```bash
apt-get update && apt-get -y upgrade && \
apt-get install -y docker.io docker-compose-v2 ufw fail2ban git curl && \
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable && \
systemctl enable --now docker fail2ban
```

Erklärung:
- aktualisiert das System
- installiert Docker, Docker Compose, UFW (Firewall), Fail2Ban (schützt vor Brute-Force), Git
- öffnet nur Port 22 (SSH), 80 (HTTP), 443 (HTTPS) — alles andere ist zu
- startet Docker und Fail2Ban

Dauer: 2–4 Minuten.

---

## Schritt 6 — Projekt-Dateien hochladen

### Variante A: per Git (empfohlen)

```bash
mkdir -p /opt/aicono && cd /opt/aicono
git clone https://github.com/<DEIN-GITHUB-USER>/<DEIN-REPO>.git aicono-ems
cd aicono-ems/docs/ocpp-persistent-server
```

> Hinweis: Wenn du das Repo über Lovable → GitHub verbunden hast, findest du die Repo-URL in deinen GitHub-Einstellungen.

### Variante B: per WinSCP/Cyberduck (für absolute Anfänger)

1. Lade WinSCP (Windows) oder Cyberduck (Mac) herunter.
2. Neue Verbindung: **SFTP**, Host = Server-IP, User = `root`, Passwort = dein Server-Passwort.
3. Im rechten (Server-)Fenster nach `/opt/aicono/` navigieren (ggf. anlegen).
4. Im linken (lokalen) Fenster den Ordner `docs/ocpp-persistent-server` aus dem heruntergeladenen Lovable-Projekt auswählen.
5. Per Drag & Drop nach rechts kopieren.
6. Im SSH-Terminal:
   ```bash
   cd /opt/aicono/ocpp-persistent-server
   ```

---

## Schritt 7 — `.env` ausfüllen

```bash
cp .env.example .env
nano .env
```

Trage ein:

| Variable | Wo finde ich den Wert |
|---|---|
| `SUPABASE_URL` | Lovable → Cloud → Backend → Settings → API → `Project URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable → Cloud → Backend → Settings → API → `service_role secret` (⚠ niemals teilen!) |
| `OCPP_DOMAIN` | `ocpp.deine-domain.de` |
| `LOG_LEVEL` | `info` |

Speichern: `Strg+O`, Enter, `Strg+X`.

---

## Schritt 8 — Container starten

```bash
docker compose up -d --build
```

Das baut das Image und startet zwei Container: `ocpp-server` und `ocpp-caddy`.

Prüfen:
```bash
docker ps                                      # beide müssen "Up" sein
curl -sf http://localhost:8080/health          # {"status":"ok",...}
curl -sf https://ocpp.deine-domain.de/health   # {"status":"ok",...}
```

Falls der zweite curl-Befehl 1–2 Minuten lang Fehler gibt: Caddy holt gerade das Let's-Encrypt-TLS-Zertifikat. Logs prüfen:
```bash
docker logs ocpp-caddy --tail 50
```
Sobald du `certificate obtained successfully` siehst, ist alles fertig.

---

## Schritt 9 — TLS automatisch (Caddy + Let's Encrypt)

Caddy holt sich das Zertifikat **automatisch** beim ersten Start. Voraussetzung: DNS muss schon auf den Server zeigen (Schritt 3) und Port 80+443 müssen offen sein (Schritt 5). Erfolgreich erkennst du an:

```
ocpp-caddy | certificate obtained successfully
```

Das Zertifikat wird automatisch alle 60 Tage erneuert.

---

## Schritt 10 — Wallbox auf neue OCPP-URL umstellen

### Bender / Nidec (Webinterface)
1. Öffne im Browser die Wallbox-IP, logge dich ein (admin-Benutzer).
2. Menü **„OCPP“** oder **„Backend“**.
3. **OCPP Server URL:** `wss://ocpp.deine-domain.de/<OCPP_ID>`
   (`<OCPP_ID>` ist die in Lovable hinterlegte ID, z. B. `NIDAC000003`)
4. **OCPP Subprotocol:** `ocpp1.6`
5. Falls Basic Auth gesetzt: **Username** = `<OCPP_ID>`, **Password** = das Passwort aus Lovable
6. Speichern, **Wallbox neu starten** (Reset-Knopf oder per Webinterface).

### Andere Hersteller
URL hat überall die gleiche Form. Suche nach „OCPP URL“, „Backend“, „Central System“.

---

## Schritt 11 — Erfolgskontrolle in Lovable

1. In Lovable: **Laden → OCPP-Integration**.
2. Die Wallbox muss innerhalb von 30 s als **„Verbunden“** angezeigt werden.
3. In den Server-Logs sehen:
   ```bash
   docker logs -f ocpp-server | grep NIDAC000003
   ```
   Du siehst `WebSocket open`, dann alle 30 s `Heartbeat`.

---

## Schritt 12 — Updates einspielen

```bash
cd /opt/aicono/aicono-ems
git pull
cd docs/ocpp-persistent-server
docker compose up -d --build
```

Der laufende Container wird durch die neue Version ersetzt. Verbindungen brechen kurz (~5 s) ab und werden von der Wallbox automatisch wiederhergestellt.

---

## Schritt 13 — Backup & Restart-Verhalten

- `restart: always` ist gesetzt → Container starten nach Reboot/Stromausfall automatisch
- Konfigurations-Backup (einmalig genügt):
  ```bash
  tar czf ~/ocpp-backup-$(date +%F).tar.gz /opt/aicono/aicono-ems/docs/ocpp-persistent-server
  ```
  Datei z. B. mit WinSCP herunterladen.

---

## Schritt 14 — Zweite OCPP-Bridge für Staging hinzufügen (Klick für Klick, für Laien)

Diese Anleitung führt dich Schritt für Schritt durch die Einrichtung einer **zweiten** OCPP-Bridge auf deinem **bereits laufenden** Hetzner-Server. Die bestehende Live-Bridge wird dabei **nicht angefasst**.

### Deine Server-Übersicht (zum Mitlesen)

| Server | IP-Adresse | Was läuft dort |
|---|---|---|
| **OCPP-Gateway-Server** | **178.105.45.225** | Hier installieren wir die zweite Bridge |
| **Energiemanagement-Server** | **91.99.170.143** | Hier läuft deine Live-Supabase (wird nur als Adresse eingetragen, nicht angefasst) |

> **Wichtig:** Alle Befehle in diesem Schritt führst du **ausschließlich** auf dem Server **178.105.45.225** aus. Den Server `91.99.170.143` fasst du in dieser Anleitung **nicht** an.

### Was am Ende läuft

```text
Auf 178.105.45.225:

  Container "ocpp-server"           (existiert bereits, bleibt unverändert)
    => wss://ocpp.aicono.org         => Live-Supabase (91.99.170.143)

  Container "ocpp-server-staging"   (NEU - das bauen wir hier)
    => wss://staging-ocpp.aicono.org => Lovable-Cloud

  Container "ocpp-caddy"            (existiert bereits, bekommt 1 neuen Block)
    => kuemmert sich um HTTPS fuer BEIDE Domains
```

### Antwort auf "Wem sagt man, wohin er sich verbindet?"

- Die **Wallbox** entscheidet durch ihre OCPP-URL, an welche **Bridge** sie spricht:
  - `wss://ocpp.aicono.org/<id>` => Live-Bridge
  - `wss://staging-ocpp.aicono.org/<id>` => Staging-Bridge
- Die **Bridge** entscheidet durch ihre `.env`-Datei (Eintrag `SUPABASE_URL`), in welche **Datenbank** sie schreibt:
  - Live-Bridge `.env` => Live-Supabase auf 91.99.170.143
  - Staging-Bridge `.env` => Lovable-Cloud

---

### Schritt 14.0 — PuTTY und WinSCP auf Windows installieren

Falls noch nicht installiert:

1. **PuTTY** (SSH-Konsole): https://www.putty.org → klicke "Download PuTTY" → "64-bit x86 MSI installer" herunterladen → doppelklicken → "Next, Next, Install, Finish".
2. **WinSCP** (Datei-Browser zum Server, brauchen wir nur als Notfall-Reserve): https://winscp.net → "Download WinSCP" → Standard-Installation mit "Weiter, Weiter, Fertig stellen".

> **So funktioniert Copy-Paste in PuTTY:**
> - Text im Browser markieren + `Strg+C`
> - In PuTTY: **rechte Maustaste** drueckt = Einfuegen (NICHT `Strg+V`!)
> - `Enter` druecken fuehrt den Befehl aus
> - Wenn ein Befehl mehrere Zeilen hat: einfach den ganzen Block markieren und mit Rechtsklick einfuegen. PuTTY fuehrt jede Zeile automatisch aus.

---

### Schritt 14.1 — In PuTTY auf 178.105.45.225 anmelden

1. PuTTY starten (Windows-Startmenue → "PuTTY").
2. Im Hauptfenster ausfuellen:
   - **Host Name (or IP address):** `178.105.45.225`
   - **Port:** `22`
   - **Connection type:** `SSH` (das ist die Voreinstellung)
3. Unten **"Open"** klicken.
4. Beim ersten Mal kommt das Fenster **"PuTTY Security Alert"** → **"Accept"** klicken.
5. Im schwarzen Fenster steht **"login as:"** → tippe `root` und druecke Enter.
6. **"root@178.105.45.225's password:"** erscheint → tippe dein Root-Passwort und druecke Enter.
   - **Wichtig:** Waehrend du das Passwort tippst, **siehst du nichts** (keine Sterne, nichts). Das ist normal!

**Erwartetes Ergebnis:** Es erscheint eine Zeile, die so aehnlich aussieht:
```
root@ocpp-server:~#
```
Der genaue Name (`ocpp-server`) kann anders heissen. Wichtig: Die Zeile endet mit `#`. Damit bist du eingeloggt.

> **Falls Fehler:** "Access denied" => falsches Passwort, nochmal versuchen. "Connection refused" / "timed out" => Server-IP pruefen, evtl. Firewall.

---

### Schritt 14.2 — Bestandsaufnahme: laeuft das Live-System wie erwartet?

Fuege diesen Befehl per Rechtsklick ein und druecke Enter:

```
docker ps
```

**Erwartete Ausgabe** (in etwa, die wichtigen Punkte fett):
```
CONTAINER ID   IMAGE              ...   STATUS         ...   NAMES
abc123...      ocpp-...           ...   Up 5 days      ...   ocpp-server
def456...      caddy:2-alpine     ...   Up 5 days      ...   ocpp-caddy
```

Du musst genau diese **zwei** Container sehen:
- `ocpp-server` (Status beginnt mit "Up")
- `ocpp-caddy` (Status beginnt mit "Up")

> **Falls einer fehlt oder "Exited" statt "Up" steht:** STOPP. Bitte melde dich, bevor du weiter machst. Wir wollen nichts kaputtmachen.

---

### Schritt 14.3 — Den Ordner der Live-Installation finden

Damit wir in spaeteren Schritten die richtige Caddy-Konfiguration anpassen, muessen wir wissen, wo die Live-Installation liegt. Gib ein:

```
ls /opt/aicono
```

**Erwartete Ausgabe:** eine Liste von Ordnern, darunter typischerweise:
```
aicono-ems   ocpp-persistent-server
```

Der Live-Ordner heisst meistens `ocpp-persistent-server` (das ist der Standard aus dieser Anleitung). Notiere dir den Namen — wir nennen ihn ab jetzt `<LIVE-ORDNER>`.

Zur Sicherheit pruefen, dass dort wirklich die Live-Installation liegt:

```
ls /opt/aicono/ocpp-persistent-server
```

**Erwartete Ausgabe** (in beliebiger Reihenfolge):
```
Caddyfile  Dockerfile  README.md  docker-compose.yml  package.json  src  tsconfig.json  .env
```

Wenn `Caddyfile` und `docker-compose.yml` dabei sind, ist es der richtige Ordner.

> **Falls dein Live-Ordner anders heisst** (z. B. `ocpp-live`): merke dir den Namen und ersetze in allen folgenden Befehlen `ocpp-persistent-server` durch deinen Namen.

---

### Schritt 14.4 — DNS-Eintrag fuer `staging-ocpp.aicono.org` in Cloudflare anlegen

1. Browser oeffnen, einloggen auf https://dash.cloudflare.com
2. Domain **`aicono.org`** anklicken.
3. Links im Menue **"DNS"** → **"Records"** → oben rechts **"Add record"** klicken.
4. Felder genau so ausfuellen:
   - **Type:** `A`
   - **Name:** `staging-ocpp` (Cloudflare ergaenzt automatisch zu `staging-ocpp.aicono.org`)
   - **IPv4 address:** `178.105.45.225`
   - **Proxy status:** **DNS only** (graue Wolke) — **NICHT** die orange Wolke! Die orange Wolke wuerde WebSockets blockieren.
   - **TTL:** `Auto`
5. **"Save"** klicken.

**Test im PuTTY-Fenster:**
```
nslookup staging-ocpp.aicono.org
```

**Erwartete Ausgabe** (irgendwo darin):
```
Name:    staging-ocpp.aicono.org
Address: 178.105.45.225
```

> **Falls stattdessen `104.x.x.x` oder `172.x.x.x` erscheint:** Die Wolke in Cloudflare steht noch auf orange. Zurueck zu Cloudflare, Eintrag bearbeiten, auf "DNS only" (grau) stellen, 1-2 Minuten warten, Befehl wiederholen.

---

### Schritt 14.5 — Neuesten Code von GitHub auf den Server holen

Damit die Staging-Bridge die aktuelle Version baut, holen wir den neuesten Code:

```
cd /opt/aicono/aicono-ems
git pull
```

**Erwartete Ausgabe** — eine von zwei Varianten:
- `Already up to date.` (es gab keine neuen Aenderungen — auch ok)
- Oder eine Liste geaenderter Dateien, endend mit z. B. `Fast-forward` und einer Zusammenfassung.

> **Falls "Permission denied" oder "not a git repository":** STOPP, bitte melden. Wir muessen das Repository zuerst klaeren, bevor wir weitermachen.

---

### Schritt 14.6 — Welches Docker-Netzwerk benutzt die Live-Bridge?

Die neue Staging-Bridge muss ins **selbe Docker-Netzwerk** wie die Live-Bridge, damit Caddy sie erreichen kann. Wir ermitteln den Namen jetzt automatisch.

Gib genau diesen Befehl ein:

```
docker inspect ocpp-caddy --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'
```

**Erwartete Ausgabe:** eine einzelne Zeile mit dem Netzwerk-Namen, typischerweise:
```
ocpp-persistent-server_ocppnet
```

**Notiere diesen Namen exakt** (auch Gross-/Kleinschreibung und Unterstriche). Wir nennen ihn ab jetzt `<NETZWERK-NAME>`.

> **Beispiel:** Wenn die Ausgabe `ocpp-persistent-server_ocppnet` lautet, dann ist `<NETZWERK-NAME> = ocpp-persistent-server_ocppnet`.

---

### Schritt 14.7 — Neuen Staging-Ordner anlegen und Code reinkopieren

```
mkdir -p /opt/aicono/ocpp-staging
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-staging/
ls /opt/aicono/ocpp-staging
```

**Erwartete Ausgabe** der letzten Zeile (Dateien koennen in anderer Reihenfolge sein):
```
Caddyfile  Dockerfile  README.md  docker-compose.yml  package.json  src  tsconfig.json  .env.example
```

---

### Schritt 14.8 — `.env` fuer Staging anlegen (zeigt auf Lovable-Cloud)

```
nano /opt/aicono/ocpp-staging/.env
```

Es oeffnet sich ein simpler Texteditor. **Loesche alles**, was drin steht (Tasten: `Strg+K` haelt eine Zeile loescht — mehrfach druecken, bis leer), und fuege dann per Rechtsklick **genau diesen Inhalt** ein:

```env
SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudmV1Z3ljdXJwbHN6ZXZkeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzQ1NzIsImV4cCI6MjA4NjExMDU3Mn0.iWwhILBtqhXomHTYr3jtFh-KKhbCOuDnLnCYvUmr1nw
OCPP_DOMAIN=staging-ocpp.aicono.org
PORT=8080
LOG_LEVEL=debug
PING_INTERVAL_SECONDS=25
IDLE_TIMEOUT_SECONDS=120
COMMAND_POLL_INTERVAL_MS=2000
ENABLE_REALTIME=true
OCPP_STARTUP_CHECK_ID=testbox01
```

**Speichern:** `Strg+O` druecken, dann `Enter`, dann `Strg+X`.

**Kontrolle:**
```
cat /opt/aicono/ocpp-staging/.env
```

Erwartet: derselbe Inhalt wie oben.

---

### Schritt 14.9 — `docker-compose.yml` fuer Staging anlegen

```
nano /opt/aicono/ocpp-staging/docker-compose.yml
```

**Alles loeschen**, dann per Rechtsklick **genau diesen Inhalt** einfuegen — aber **ersetze `<NETZWERK-NAME>`** in der vorletzten Zeile durch den Namen aus Schritt 14.6 (z. B. `ocpp-persistent-server_ocppnet`):

```yaml
services:
  ocpp:
    build: .
    container_name: ocpp-server-staging
    restart: always
    env_file: .env
    expose:
      - "8080"
    networks:
      - shared-net

networks:
  shared-net:
    external: true
    name: <NETZWERK-NAME>
```

**Beispiel** (wenn dein Netzwerk `ocpp-persistent-server_ocppnet` heisst), muss die letzte Zeile so aussehen:
```
    name: ocpp-persistent-server_ocppnet
```

Speichern wie oben: `Strg+O`, `Enter`, `Strg+X`.

**Kontrolle:**
```
cat /opt/aicono/ocpp-staging/docker-compose.yml
```

Pruefe, dass `name: <NETZWERK-NAME>` durch deinen echten Namen ersetzt ist.

---

### Schritt 14.10 — Caddyfile der Live-Installation erweitern (nur 1 Block hinzufuegen)

Wir oeffnen die bestehende Caddy-Konfiguration und haengen **nur einen neuen Block** ans Ende an. Die bestehenden Eintraege bleiben unveraendert.

```
nano /opt/aicono/ocpp-persistent-server/Caddyfile
```

Du siehst dort bereits Inhalte (mehrere Bloecke fuer `ocpp.aicono.org`). **Diese nicht anfassen!** Gehe mit der Pfeiltaste **ganz nach unten** ans Datei-Ende (oder `Strg+End` haelt direkt zum Ende). Druecke dort `Enter` fuer eine Leerzeile und fuege per Rechtsklick **genau diesen Block** ein:

```
staging-ocpp.aicono.org {
	encode gzip
	reverse_proxy ocpp-server-staging:8080 {
		header_up Host {host}
		header_up X-Real-IP {remote}
		header_up X-Forwarded-Proto https
	}
}
```

Speichern: `Strg+O`, `Enter`, `Strg+X`.

**Caddy neu laden** (uebernimmt die neue Konfiguration ohne Neustart):

```
docker exec ocpp-caddy caddy reload --config /etc/caddy/Caddyfile
```

**Erwartete Ausgabe:** **keine** Fehlermeldung. Wenn nichts kommt, ist alles gut.

> **Falls eine Fehlermeldung erscheint** (`adapting config` o.ae.): Datei nochmal oeffnen, pruefen, dass der neue Block sauber unter dem bestehenden Inhalt steht und alle `{` und `}` korrekt sind. Im Notfall den hinzugefuegten Block wieder loeschen, speichern, Reload-Befehl erneut ausfuehren — dann ist alles wie vorher.

---

### Schritt 14.11 — Staging-Container bauen und starten

```
cd /opt/aicono/ocpp-staging
docker compose up -d --build
```

Das **dauert beim ersten Mal 2-5 Minuten**, weil das Docker-Image neu gebaut wird. Du siehst viele Zeilen mit `=> [...]`.

**Erwartete letzte Zeilen:**
```
 [+] Running 1/1
  Container ocpp-server-staging  Started
```

**Sofort danach pruefen:**
```
docker ps
```

**Erwartet:** Jetzt **drei** Container mit Status "Up":
- `ocpp-server` (Live, war schon da)
- `ocpp-server-staging` (neu)
- `ocpp-caddy` (war schon da)

---

### Schritt 14.12 — Logs der neuen Staging-Bridge ansehen

```
docker logs --tail 50 ocpp-server-staging
```

**Erwartete Zeilen** (sinngemaess, JSON-Format):
```
{"level":"info","msg":"Startup check OK","ocppId":"testbox01"}
{"level":"info","msg":"Server listening","port":8080}
```

> **Falls "Startup check failed" oder "401 Unauthorized" zu sehen ist:**
> Der Anon-Key in der `.env` stimmt nicht. Schritt 14.8 wiederholen, dann
> `cd /opt/aicono/ocpp-staging && docker compose up -d --build` erneut ausfuehren.

---

### Schritt 14.13 — HTTPS-Test fuer beide Domains

```
curl -sf https://ocpp.aicono.org/health
echo
curl -sf https://staging-ocpp.aicono.org/health
echo
```

**Erwartete Ausgabe** (zweimal hintereinander):
```
{"status":"ok",...}
{"status":"ok",...}
```

> **Falls Staging nicht antwortet** (`curl: (...) error` oder leere Antwort): 60 Sekunden warten — Caddy holt gerade das Let's-Encrypt-Zertifikat fuer die neue Domain — dann erneut testen.
> Wenn auch nach 2 Minuten nichts kommt: `docker logs --tail 80 ocpp-caddy | grep -i staging` zeigt den Grund.

---

### Schritt 14.14 — Funktionstest mit dem Simulator in Lovable

1. Browser → oeffne deine Lovable-Preview-App.
2. Gehe zur Seite **`/super-admin/ocpp/simulator`**.
3. **Server-URL:** `wss://staging-ocpp.aicono.org/`
4. Waehle die Test-Wallbox `testbox01` aus → **Verbinden**.

**Erwartet:** Status zeigt `Connected (subprotocol: ocpp1.6)` und bleibt mindestens 30 Sekunden stabil. Im PuTTY-Fenster siehst du parallel mit:
```
docker logs -f ocpp-server-staging
```
neue Zeilen mit `BootNotification`, `Heartbeat` usw. (Abbrechen mit `Strg+C`.)

---

### Schritt 14.15 — Wallboxen den richtigen Umgebungen zuordnen

| Wallbox-Typ | OCPP-URL in der Wallbox eintragen | Daten landen in |
|---|---|---|
| **Echte Live-Wallbox** | `wss://ocpp.aicono.org/<seriennr>` | Live-Supabase (91.99.170.143) |
| **Simulator / Lovable-Test** | `wss://staging-ocpp.aicono.org/<seriennr>` | Lovable-Cloud |

Wenn du eine Wallbox spaeter "umziehen" willst (z. B. von Staging auf Live), **aenderst du nur die URL in der Wallbox** — sonst nichts.

---

### Schritt 14.16 — Updates einspielen (der sichere Weg)

Hier sind drei klar getrennte Mini-Anleitungen. **Immer zuerst Staging updaten, testen, dann erst Live.**

#### A) Nur Staging updaten

```
cd /opt/aicono/aicono-ems && git pull
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-staging/src/
cd /opt/aicono/ocpp-staging && docker compose up -d --build
docker logs --tail 30 ocpp-server-staging
```

**Erfolg:** Letzte Log-Zeilen ohne `error`. Simulator verbindet sich weiterhin (Schritt 14.14 wiederholen).

#### B) Live updaten (erst nach erfolgreichem Staging-Test!)

```
cd /opt/aicono/aicono-ems && git pull
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-persistent-server/src/
cd /opt/aicono/ocpp-persistent-server && docker compose up -d --build
docker logs --tail 30 ocpp-server
```

**Erfolg:** Letzte Log-Zeilen ohne `error`. Echte Wallboxen verbinden sich nach ca. 5 Sekunden automatisch wieder.

#### C) Notfall: Staging anhalten (Live laeuft weiter unberuehrt)

```
cd /opt/aicono/ocpp-staging && docker compose down
```

Damit wird **nur** der Staging-Container gestoppt. Die Live-Bridge laeuft komplett unveraendert weiter.

---

### Schritt 14.17 — Logs getrennt lesen

```
docker logs -f ocpp-server           # nur Live (Strg+C beendet)
docker logs -f ocpp-server-staging   # nur Staging
docker logs -f ocpp-caddy            # TLS & Routing fuer beide
```


---

## Schritt 15 — Notfall-Rollback

Wenn der neue Server Probleme macht und du sofort zurück auf die alte Edge-Function-URL willst:

1. In Lovable die Wallbox-OCPP-URL wieder auf `wss://ocpp.aicono.org/<OCPP_ID>` setzen (alter Endpunkt).
2. Im Bender/Nidec-Webinterface dieselbe URL eintragen, neu starten.
3. Innerhalb 1 Minute ist die alte Verbindung aktiv.

Der neue Server kann parallel weiterlaufen — er stört nicht.

---

## Hilfe & Support

Schicke mir bei Fragen oder Problemen einfach:

1. Output von `docker ps`
2. Letzte 100 Zeilen von `docker logs --tail 100 ocpp-server`
3. Was du gerade beobachtest

Ich antworte mit konkreten Befehlen.
