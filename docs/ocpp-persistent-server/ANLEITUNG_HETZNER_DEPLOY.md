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

## Schritt 14 — Zwei Instanzen auf demselben Server (Live + Staging)

Empfohlen: **ein** Hetzner-Server, **zwei** komplett getrennte Docker-Compose-Projekte. So sparst du Kosten (1× CX22 reicht) und hast trotzdem eine saubere Trennung zwischen Produktion und Lovable-Staging.

### Zielbild

```text
Live-Wallboxen     ──►  wss://ocpp.aicono.org/<seriennr>          ──►  Container "ocpp-server-live"     ──►  Selbst gehostete Live-Supabase (Hetzner)
Staging/Simulator  ──►  wss://staging-ocpp.aicono.org/<seriennr>  ──►  Container "ocpp-server-staging"  ──►  Lovable-Cloud (xnveugycurplszevdxtw)
```

Beide Container hängen am selben Docker-Netz `ocpp-shared`. **Eine** Caddy (Container `ocpp-caddy`) terminiert TLS für **beide** Domains und holt zwei Let's-Encrypt-Zertifikate.

> Du brauchst vorher: **Hetzner-Server-IP**, **Root-Passwort**, **URL deiner Live-Supabase** (z. B. `https://supabase.aicono.org`) und den **Anon-Key der Live-Supabase** (aus dem Live-Supabase-Studio → Project Settings → API).

---

### Schritt 14.0 — Werkzeuge auf deinem Windows-Laptop installieren

1. **PuTTY** (SSH-Konsole): https://www.putty.org → „64-bit x86 MSI installer" → installieren mit „Weiter, Weiter, Fertig stellen".
2. **WinSCP** (Datei-Upload ohne Konsole): https://winscp.net → Standard-Installation.

### Schritt 14.1 — PuTTY: Erstverbindung Klick-für-Klick

1. PuTTY starten (Windows-Startmenü → „PuTTY").
2. Feld **„Host Name (or IP address)"** = deine Hetzner-IP.
3. **„Port"** = `22`, **„Connection type"** = `SSH` (Voreinstellung).
4. Unten **„Open"** klicken.
5. Fenster „PuTTY Security Alert" → **„Accept"**.
6. **„login as:"** → `root` tippen, Enter.
7. **„root@…'s password:"** → Passwort tippen (du siehst nichts beim Tippen, das ist normal), Enter.
8. Es erscheint `root@ocpp-server:~#` → du bist drin.

> **Copy-Paste in PuTTY:** Text im Browser markieren + `Strg+C`. In PuTTY mit **rechter Maustaste** einfügen (nicht `Strg+V`). Enter führt aus.

### Schritt 14.2 — DNS-Eintrag für `staging-ocpp.aicono.org` in Cloudflare

1. Browser → https://dash.cloudflare.com einloggen.
2. Domain `aicono.org` anklicken.
3. Links **DNS → Records → Add record**.
4. Werte:
   - **Type:** `A`
   - **Name:** `staging-ocpp`
   - **IPv4 address:** dieselbe Hetzner-IP wie `ocpp.aicono.org`
   - **Proxy status:** **DNS only** (graue Wolke!) – orange Wolke blockiert WebSockets.
   - **TTL:** Auto
5. **Save**.
6. Im PuTTY-Fenster prüfen:
   ```
   nslookup staging-ocpp.aicono.org
   ```
   Erwartet: die Hetzner-IP. Wenn `104.x.x.x` erscheint, ist die Wolke noch orange → in Cloudflare auf grau umstellen.

### Schritt 14.3 — Zwei Arbeits-Ordner anlegen

In PuTTY exakt diesen Block per Rechtsklick einfügen und Enter:

```
mkdir -p /opt/aicono/ocpp-live /opt/aicono/ocpp-staging
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-live/
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-staging/
docker network create ocpp-shared 2>/dev/null || true
```

Erwartet: keine Fehlermeldung. „network already exists" ist ok.

### Schritt 14.4 — `.env` für Live (zeigt auf selbst gehostete Supabase)

```
cd /opt/aicono/ocpp-live
cp .env.example .env
nano .env
```

Datei **komplett ersetzen** durch (deine Live-Werte einsetzen!):

```env
SUPABASE_URL=https://DEINE-LIVE-SUPABASE-DOMAIN
SUPABASE_ANON_KEY=DEIN-LIVE-ANON-KEY
OCPP_DOMAIN=ocpp.aicono.org
PORT=8080
LOG_LEVEL=info
PING_INTERVAL_SECONDS=25
IDLE_TIMEOUT_SECONDS=120
COMMAND_POLL_INTERVAL_MS=2000
ENABLE_REALTIME=false
OCPP_STARTUP_CHECK_ID=testbox01
```

Speichern: `Strg+O`, Enter, `Strg+X`.

### Schritt 14.5 — `.env` für Staging (zeigt auf Lovable-Cloud)

```
cd /opt/aicono/ocpp-staging
cp .env.example .env
nano .env
```

Datei **komplett ersetzen** durch:

```env
SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudmV1Z3ljdXJwbHN6ZXZkeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzQ1NzIsImV4cCI6MjA4NjExMDU3Mn0.iWwhILBtqhXomHTYr3jtFh-KKhbCOuDnLnCYvUmr1nw
OCPP_DOMAIN=staging-ocpp.aicono.org
PORT=8080
LOG_LEVEL=debug
PING_INTERVAL_SECONDS=25
IDLE_TIMEOUT_SECONDS=120
COMMAND_POLL_INTERVAL_MS=2000
ENABLE_REALTIME=false
OCPP_STARTUP_CHECK_ID=testbox01
```

Speichern wie oben.

### Schritt 14.6 — Live-Compose: Container umbenennen + gemeinsames Netz

`nano /opt/aicono/ocpp-live/docker-compose.yml` öffnen, **kompletten Inhalt** ersetzen durch:

```yaml
services:
  ocpp:
    build: .
    container_name: ocpp-server-live
    restart: always
    env_file: .env
    expose:
      - "8080"
    networks:
      - shared-ocpp-net

  caddy:
    image: caddy:2-alpine
    container_name: ocpp-caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - ocpp
    networks:
      - shared-ocpp-net

volumes:
  caddy_data:
  caddy_config:

networks:
  shared-ocpp-net:
    external: true
    name: ocpp-shared
```

Speichern.

### Schritt 14.7 — Staging-Compose: nur Bridge, KEINE eigene Caddy

`nano /opt/aicono/ocpp-staging/docker-compose.yml` öffnen, **kompletten Inhalt** ersetzen durch:

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
      - shared-ocpp-net

networks:
  shared-ocpp-net:
    external: true
    name: ocpp-shared
```

Speichern.

### Schritt 14.8 — Caddyfile mit beiden Domains

`nano /opt/aicono/ocpp-live/Caddyfile` öffnen, **kompletten Inhalt** ersetzen durch:

```caddy
ocpp.aicono.org {
  encode gzip
  reverse_proxy ocpp-server-live:8080 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
}

staging-ocpp.aicono.org {
  encode gzip
  reverse_proxy ocpp-server-staging:8080 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

Speichern.

### Schritt 14.9 — Beides starten

```
cd /opt/aicono/ocpp-live && docker compose up -d --build
cd /opt/aicono/ocpp-staging && docker compose up -d --build
docker ps
```

Erwartet: drei Container `Up` → `ocpp-server-live`, `ocpp-server-staging`, `ocpp-caddy`.

### Schritt 14.10 — TLS-Zertifikate prüfen (60–90 Sek. warten)

```
docker logs ocpp-caddy --tail 100 | grep "certificate obtained"
```

Erwartet: **zwei** Zeilen (eine pro Domain). Wenn nur eine, nochmal 60 Sek. warten und Befehl wiederholen.

### Schritt 14.11 — Health-Checks

```
curl -sf https://ocpp.aicono.org/health
curl -sf https://staging-ocpp.aicono.org/health
```

Beide müssen `{"status":"ok",...}` antworten.

### Schritt 14.12 — Funktionstest mit dem Simulator

1. Browser → Lovable-Preview-App.
2. `/super-admin/ocpp/simulator` öffnen.
3. **Server-URL:** `wss://staging-ocpp.aicono.org/`
4. Wallbox `testbox01` wählen, **Verbinden**.
5. Erwartet: `Connected (subprotocol: ocpp1.6)`, bleibt stabil ≥ 30 Sek.

### Schritt 14.13 — Wallboxen zuordnen

| Umgebung | OCPP-URL für die Wallbox |
|---|---|
| **Live** (echte Wallboxen, Live-Supabase) | `wss://ocpp.aicono.org/<seriennr>` |
| **Staging** (Simulator, Lovable-Preview) | `wss://staging-ocpp.aicono.org/<seriennr>` |

### Schritt 14.14 — Updates einzeln einspielen

```
cd /opt/aicono/aicono-ems && git pull

# Nur Staging updaten:
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-staging/src/
cd /opt/aicono/ocpp-staging && docker compose up -d --build

# Erst nach erfolgreichem Test: Live updaten
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-live/src/
cd /opt/aicono/ocpp-live && docker compose up -d --build
```

### Schritt 14.15 — Logs getrennt lesen

```
docker logs -f ocpp-server-live      # nur Live
docker logs -f ocpp-server-staging   # nur Staging
docker logs -f ocpp-caddy            # TLS / Routing beider
```

### Schritt 14.16 — Notfall-Rollback (falls Staging die Live stört)

```
cd /opt/aicono/ocpp-staging && docker compose down
docker exec ocpp-caddy caddy reload --config /etc/caddy/Caddyfile
```

Live läuft weiter unverändert.


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
