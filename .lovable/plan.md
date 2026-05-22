## Was geändert wird (nur Doku, kein Code)

Eine einzige Datei wird angepasst:

**`docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md`** – konkret der bestehende **Schritt 14** („Zwei Instanzen auf demselben Server").

Es wird **keine** Quellcode-Datei und **kein** Docker-Image geändert. Die Bridge selbst kann beides bereits – es ist reine Konfigurations- und DNS-Arbeit.

---

## Zielbild nach Umsetzung

```text
Live-Wallboxen     ──►  wss://ocpp.aicono.org/<seriennr>          ──►  Container "ocpp-server-live"     ──►  Selbst gehostete Live-Supabase (Hetzner)
Staging/Simulator  ──►  wss://staging-ocpp.aicono.org/<seriennr>  ──►  Container "ocpp-server-staging"  ──►  Lovable-Cloud (xnveugycurplszevdxtw)

Beide Container hängen am selben Docker-Netz `ocpp-shared`.
EINE Caddy (Container `ocpp-caddy`) terminiert TLS für BEIDE Domains und holt zwei Let's-Encrypt-Zertifikate.
```

---

## Inhalt, der in `ANLEITUNG_HETZNER_DEPLOY.md` neu geschrieben wird

Der **gesamte Schritt 14** wird ersetzt durch eine neue, ausführlichere Fassung mit folgenden Unterabschnitten. Jeder Schritt enthält: was anklicken, was tippen, was als Antwort kommen muss, und was zu tun ist, wenn etwas nicht passt.

### 14.0 – Vorbereitung (für komplette Laien)

- **PuTTY herunterladen** (Windows): Link auf https://www.putty.org → „64-bit x86 MSI installer". Installieren mit „Weiter, Weiter, Fertig stellen".
- **WinSCP herunterladen** (Datei-Upload ohne Konsole): https://winscp.net → Standard-Installation.
- Notizzettel mit folgenden Werten anlegen (brauchst du gleich):
  - **Hetzner-Server-IP** (z. B. `116.203.XX.XX`)
  - **Root-Passwort** des Hetzner-Servers
  - **URL der Live-Supabase** (z. B. `https://supabase.aicono.org`)
  - **Anon-Key der Live-Supabase** (aus dem Hetzner-Supabase-Studio → Project Settings → API)

### 14.1 – PuTTY: Erstverbindung Klick-für-Klick

1. PuTTY starten (Windows-Startmenü → „PuTTY").
2. Im Feld **„Host Name (or IP address)"** die Hetzner-IP eintippen.
3. **„Port"** = `22`, **„Connection type"** = `SSH` (Voreinstellung).
4. Unten **„Open"** klicken.
5. Erstes Fenster „PuTTY Security Alert" → **„Accept"** klicken.
6. **„login as:"** → `root` tippen, Enter.
7. **„root@…'s password:"** → Passwort tippen (du siehst nichts beim Tippen, das ist normal), Enter.
8. Es erscheint die Zeile `root@ocpp-server:~#` → du bist drin.

> **Tipp Copy-Paste in PuTTY:** Text im Browser markieren + `Strg+C`. In PuTTY mit **rechter Maustaste** einfügen (nicht `Strg+V`). Enter drückt aus.

### 14.2 – DNS-Eintrag für `staging-ocpp.aicono.org` in Cloudflare

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

### 14.3 – Zwei Arbeits-Ordner anlegen

Im PuTTY exakt diesen Block per Rechtsklick einfügen und Enter:

```
mkdir -p /opt/aicono/ocpp-live /opt/aicono/ocpp-staging
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-live/
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-staging/
docker network create ocpp-shared 2>/dev/null || true
```

Erwartet: keine Fehlermeldung. Wenn „network already exists" kommt → ok, ignorieren.

### 14.4 – `.env` für Live (zeigt auf selbst gehostete Supabase)

```
cd /opt/aicono/ocpp-live
cp .env.example .env
nano .env
```

Datei **komplett ersetzen** durch:

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

### 14.5 – `.env` für Staging (zeigt auf Lovable-Cloud)

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

### 14.6 – Live-Compose: Container umbenennen + gemeinsames Netz

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

### 14.7 – Staging-Compose: nur Bridge, KEINE eigene Caddy

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

### 14.8 – Caddyfile mit beiden Domains

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

### 14.9 – Beides starten

```
cd /opt/aicono/ocpp-live && docker compose up -d --build
cd /opt/aicono/ocpp-staging && docker compose up -d --build
docker ps
```

Erwartet: drei Container `Up` → `ocpp-server-live`, `ocpp-server-staging`, `ocpp-caddy`.

### 14.10 – TLS-Zertifikate prüfen (60–90 Sek. warten)

```
docker logs ocpp-caddy --tail 100 | grep "certificate obtained"
```

Erwartet: **zwei** Zeilen (eine pro Domain). Wenn nur eine, nochmal 60 Sek. warten und Befehl wiederholen.

### 14.11 – Health-Checks

```
curl -sf https://ocpp.aicono.org/health
curl -sf https://staging-ocpp.aicono.org/health
```

Beide müssen `{"status":"ok",...}` antworten.

### 14.12 – Funktionstest mit dem Simulator

1. Browser → Lovable-Preview-App.
2. `/super-admin/ocpp/simulator` öffnen.
3. **Server-URL:** `wss://staging-ocpp.aicono.org/`
4. Wallbox `testbox01` wählen, **Verbinden**.
5. Erwartet: `Connected (subprotocol: ocpp1.6)`, bleibt stabil ≥ 30 Sek.

### 14.13 – Wallboxen zuordnen

| Umgebung | OCPP-URL für die Wallbox |
|---|---|
| **Live** (echte Wallboxen) | `wss://ocpp.aicono.org/<seriennr>` |
| **Staging** (Simulator, Testgeräte) | `wss://staging-ocpp.aicono.org/<seriennr>` |

### 14.14 – Updates einzeln einspielen

```
cd /opt/aicono/aicono-ems && git pull

# Nur Staging updaten:
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-staging/src/
cd /opt/aicono/ocpp-staging && docker compose up -d --build

# Erst nach erfolgreichem Test: Live updaten
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/src/. /opt/aicono/ocpp-live/src/
cd /opt/aicono/ocpp-live && docker compose up -d --build
```

### 14.15 – Logs getrennt lesen

```
docker logs -f ocpp-server-live      # nur Live
docker logs -f ocpp-server-staging   # nur Staging
docker logs -f ocpp-caddy            # TLS / Routing beider
```

### 14.16 – Notfall-Rollback (falls Staging die Live kaputtmacht)

```
cd /opt/aicono/ocpp-staging && docker compose down
docker exec ocpp-caddy caddy reload --config /etc/caddy/Caddyfile
```

Live läuft weiter unverändert.

---

## Was du nach Plan-Approval bekommst

- Der vorhandene **Schritt 14** in `docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md` wird **1:1 durch obigen Text ersetzt**. Alle anderen Schritte (1–13, 15) bleiben unverändert.
- Es entsteht **keine** zweite Doku-Datei – Single Source of Truth bleibt erhalten.
- **Kein** Code, **keine** Migrationen, **keine** Edge-Functions werden angefasst.

## Was du selbst klären musst (vor Umsetzung)

1. **URL deiner Live-Supabase** (Domain, unter der dein selbst gehostetes Supabase-Studio läuft) – kommt in `SUPABASE_URL` der Live-`.env`.
2. **Anon-Key der Live-Supabase** – aus dem Studio kopieren.
3. **Bestätigen, dass DNS-Verwaltung weiterhin über Cloudflare läuft** (laut bestehender Anleitung Stand heute Ja).

Wenn diese drei Punkte stehen: Plan annehmen, ich passe die Doku an, du arbeitest sie Schritt für Schritt durch und meldest dich nach jedem Block.
