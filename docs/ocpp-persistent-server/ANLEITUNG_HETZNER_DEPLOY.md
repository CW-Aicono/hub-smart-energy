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

## Schritt 3 — Domain vorbereiten (DNS A-Record)

Du brauchst eine Subdomain, z. B. `ocpp.deine-domain.de`.

1. Logge dich beim Anbieter deiner Domain ein (Strato, IONOS, Hetzner DNS, Cloudflare, …).
2. Suche **„DNS-Verwaltung“ → „A-Record hinzufügen“**.
3. Trage ein:
   - **Name / Host:** `ocpp` (das wird zu `ocpp.deine-domain.de`)
   - **Typ:** A
   - **Wert / Ziel:** die IPv4 deines Hetzner-Servers
   - **TTL:** 3600 (oder Standard)
4. Speichern. Die DNS-Änderung dauert 5–30 Minuten, bis sie weltweit bekannt ist.

Test: Im Terminal `nslookup ocpp.deine-domain.de` — die IP muss matchen.

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
apt-get install -y docker.io docker-compose-plugin ufw fail2ban git curl && \
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

## Schritt 14 — Zwei Instanzen auf demselben Server (Live + Test)

Empfohlen: **ein** Hetzner-Server, **zwei** komplett getrennte Docker-Compose-Projekte. So sparst du Kosten (1× CX22 reicht) und hast trotzdem eine saubere Trennung zwischen Produktion und Test/Lovable-Preview.

### Aufbau

```
ocpp.aicono.org       ──►  Caddy ──►  ocpp-live  (Container, eigenes .env, Live-Backend)
ocpp-test.aicono.org  ──►  Caddy ──►  ocpp-test  (Container, eigenes .env, Lovable-Test-Backend)
```

Beide Domains zeigen per A-Record auf dieselbe Server-IP. Caddy holt für jede Subdomain ein eigenes Let's-Encrypt-Zertifikat.

### Schritt 14.1 — DNS

Lege beim Domain-Anbieter **zwei A-Records** an, beide auf dieselbe Hetzner-IP:

| Name | Typ | Wert |
|---|---|---|
| `ocpp` | A | Server-IP (z. B. `116.203.XX.XX`) |
| `ocpp-test` | A | dieselbe Server-IP |

Test:
```bash
nslookup ocpp.aicono.org
nslookup ocpp-test.aicono.org
```
Beide IPs müssen identisch sein.

### Schritt 14.2 — Verzeichnisstruktur

```bash
mkdir -p /opt/aicono/ocpp-live /opt/aicono/ocpp-test
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-live/
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-test/
```

So bekommst du **zwei unabhängige Compose-Projekte**, die du getrennt updaten und neustarten kannst.

### Schritt 14.3 — `.env` für die Live-Instanz

```bash
cd /opt/aicono/ocpp-live
cp .env.example .env
nano .env
```

| Variable | Wert |
|---|---|
| `SUPABASE_URL` | `https://<live-project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role-Key des **Live**-Projekts |
| `OCPP_DOMAIN` | `ocpp.aicono.org` |
| `LOG_LEVEL` | `info` |

### Schritt 14.4 — `.env` für die Test-Instanz (Lovable-Preview-Projekt)

```bash
cd /opt/aicono/ocpp-test
cp .env.example .env
nano .env
```

| Variable | Wert |
|---|---|
| `SUPABASE_URL` | `https://xnveugycurplszevdxtw.supabase.co` (dieses Lovable-Projekt) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role-Key dieses Lovable-Projekts (Lovable Cloud → Backend → Settings → API) |
| `OCPP_DOMAIN` | `ocpp-test.aicono.org` |
| `LOG_LEVEL` | `debug` (mehr Details für Tests) |

### Schritt 14.5 — Port-Konflikt vermeiden

Beide Compose-Files würden standardmäßig die Ports 80 + 443 belegen. Lösung: **nur EIN Caddy** für beide Instanzen. Wir entfernen den Caddy-Block aus dem Test-Compose und ergänzen das Test-Routing im Live-Caddy.

#### a) Test-Compose ohne Caddy

Bearbeite `/opt/aicono/ocpp-test/docker-compose.yml` und **entferne den kompletten `caddy:`-Service** sowie die Volumes/Networks-Einträge, die nur Caddy braucht. Übrig bleibt nur der `ocpp:`-Service. Außerdem den Container umbenennen, damit er nicht mit dem Live-Container kollidiert:

```yaml
services:
  ocpp:
    build: .
    container_name: ocpp-server-test
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

#### b) Live-Compose: Caddy + gemeinsames Netz

In `/opt/aicono/ocpp-live/docker-compose.yml` den Container umbenennen und das gemeinsame Netz nutzen:

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

Gemeinsames Netz einmalig anlegen:
```bash
docker network create ocpp-shared
```

#### c) Caddyfile für beide Domains

`/opt/aicono/ocpp-live/Caddyfile` ersetzen durch:

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

ocpp-test.aicono.org {
  encode gzip
  reverse_proxy ocpp-server-test:8080 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

> Hinweis: Die `OCPP_DOMAIN`-Variable in den `.env`-Dateien dient ab jetzt nur noch der Logik im Node-Server (Logging/Health). Caddy hat die Domains direkt im Caddyfile.

### Schritt 14.6 — Beide Instanzen starten

```bash
# Live
cd /opt/aicono/ocpp-live
docker compose up -d --build

# Test
cd /opt/aicono/ocpp-test
docker compose up -d --build
```

Prüfen:
```bash
docker ps
# Erwartet: ocpp-server-live, ocpp-server-test, ocpp-caddy — alle "Up"

curl -sf https://ocpp.aicono.org/health        # Live
curl -sf https://ocpp-test.aicono.org/health   # Test
```

Caddy-Log auf erfolgreiche Zertifikate prüfen:
```bash
docker logs ocpp-caddy --tail 100 | grep "certificate obtained"
# Erwartet: zwei Zeilen (eine pro Domain)
```

### Schritt 14.7 — Wallboxen zuordnen

| Umgebung | OCPP-URL für die Wallbox |
|---|---|
| **Produktion** (echte Wallboxen) | `wss://ocpp.aicono.org/<OCPP_ID>` |
| **Test/Lovable-Preview** (Test-Wallbox, Simulator) | `wss://ocpp-test.aicono.org/<OCPP_ID>` |

Wichtig: **eine Wallbox pro Umgebung**, niemals beide gleichzeitig — sonst landen Sessions doppelt.

### Schritt 14.8 — Updates pro Instanz

```bash
# Nur Live updaten (Test bleibt wie es ist)
cd /opt/aicono/aicono-ems && git pull
cd /opt/aicono/ocpp-live
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. ./src/
docker compose up -d --build

# Nur Test updaten
cd /opt/aicono/ocpp-test
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. ./src/
docker compose up -d --build
```

So kannst du neue Features **erst auf Test ausprobieren** und nach erfolgreicher Prüfung auf Live übertragen.

### Schritt 14.9 — Logs getrennt lesen

```bash
docker logs -f ocpp-server-live    # nur Live-Verkehr
docker logs -f ocpp-server-test    # nur Test-Verkehr
docker logs -f ocpp-caddy          # TLS / Routing für beide
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
