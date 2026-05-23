
# Komplette Laien-Anleitung: Zweite OCPP-Bridge für Staging

Ich erweitere die Datei **`docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md`** um einen vollständig neuen **Schritt 14**, der jede einzelne PuTTY-Eingabe, jede Datei und jeden erwarteten Ausgabewert zeigt. Nichts wird vorausgesetzt — keine Linux-Kenntnisse, keine Docker-Kenntnisse.

## Deine Server (Übersicht zum Mitlesen)

| Server | IP-Adresse | Was läuft dort |
|---|---|---|
| OCPP-Gateway-Server | **178.105.45.225** | Hier installieren wir die zweite Bridge |
| Energiemanagement-Server | **91.99.170.143** | Hier läuft deine Live-Supabase (wird nur als Adresse eingetragen, nicht angefasst) |

**Wichtig:** Du arbeitest in dieser Anleitung **ausschließlich** auf **178.105.45.225**. Den anderen Server fasst du nicht an.

## Was am Ende läuft

```text
Auf 178.105.45.225:

  Container "ocpp-server"          (existiert, bleibt unverändert)
    → wss://ocpp.aicono.org        → Live-Supabase auf 91.99.170.143

  Container "ocpp-server-staging"  (NEU)
    → wss://staging-ocpp.aicono.org → Lovable-Cloud

  Container "ocpp-caddy"           (existiert, kriegt nur 1 neuen Block dazu)
    → erledigt HTTPS für BEIDE Domains
```

## Aufbau der neuen Anleitung (was in Schritt 14 stehen wird)

Jeder Unterschritt enthält:
- **Was passiert** (1 Satz, allgemeinverständlich)
- **Genaue Eingabe** (kompletter Copy-Paste-Block, einfach mit Rechtsklick in PuTTY einfügen)
- **Erwartete Ausgabe** (was du wörtlich sehen musst, um zu wissen: hat geklappt)
- **Was tun, wenn etwas anderes erscheint** (1-2 typische Fehler)

### Unterschritte im Detail

**14.0 PuTTY und WinSCP auf Windows installieren**
- Download-Links, Schritt-für-Schritt-Installer-Klicks
- Erklärt: Rechtsklick in PuTTY = Einfügen, Linksklick markiert, Enter führt aus

**14.1 In PuTTY anmelden auf 178.105.45.225**
- Felder exakt benannt: Host Name = `178.105.45.225`, Port = `22`, Connection type = SSH
- Login `root`, Passwort aus Hetzner-Mail
- Erwartete Prompt-Zeile: `root@ocpp-server:~#`

**14.2 Bestandsaufnahme: läuft alles wie erwartet?**
```
docker ps
```
Du musst genau sehen: `ocpp-server` (Up) und `ocpp-caddy` (Up). Falls nicht — STOPP und melden.

**14.3 DNS-Eintrag `staging-ocpp.aicono.org` in Cloudflare**
- Browser → Cloudflare → DNS → Add record
- Type A, Name `staging-ocpp`, IPv4 `178.105.45.225`, Proxy `DNS only` (graue Wolke!), TTL Auto
- Test in PuTTY: `nslookup staging-ocpp.aicono.org` → muss `178.105.45.225` zeigen

**14.4 Neuesten Code von GitHub auf den Server holen**
- Erst prüfen, wo das Repo liegt: `ls /opt/aicono`
- Dann: 
  ```
  cd /opt/aicono/aicono-ems
  git pull
  ```
- Erwartete Ausgabe: `Already up to date.` ODER eine Liste geänderter Dateien
- Fehlerfall „Permission denied" / „not a git repository" → STOPP, melden

**14.5 Wo liegt die Live-Installation? (zur Sicherheit nur ansehen, nichts ändern)**
```
ls /opt/aicono
cat /opt/aicono/<live-ordner>/.env | head -5
```
Damit du den Live-Ordnernamen kennst (z.B. `ocpp-persistent-server` oder `ocpp-live`). Diesen Namen brauchst du in Schritt 14.10 zum Caddy-Reload.

**14.6 Neuen Ordner für die Staging-Bridge anlegen**
```
mkdir -p /opt/aicono/ocpp-staging
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-staging/
ls /opt/aicono/ocpp-staging
```
Erwartete Ausgabe: `Caddyfile  Dockerfile  README.md  docker-compose.yml  package.json  src  tsconfig.json …`

**14.7 `.env` für Staging erstellen (zeigt auf Lovable-Cloud)**
- Befehl: `nano /opt/aicono/ocpp-staging/.env`
- **Kompletter Datei-Inhalt** zum Einfügen (Lovable-Cloud-URL, Anon-Key, Domain `staging-ocpp.aicono.org`, `LOG_LEVEL=debug`, `OCPP_STARTUP_CHECK_ID=testbox01`)
- Speichern: `Strg+O`, Enter, `Strg+X`
- Kontrolle: `cat /opt/aicono/ocpp-staging/.env`

**14.8 `docker-compose.yml` für Staging ersetzen**
- `nano /opt/aicono/ocpp-staging/docker-compose.yml`
- **Kompletter Datei-Inhalt** zum Einfügen — enthält:
  - nur 1 Service `ocpp` mit `container_name: ocpp-server-staging`
  - **kein** zweites Caddy
  - hängt sich ans bestehende Docker-Netzwerk des Live-Caddys (wird in 14.9 ermittelt und eingetragen)

**14.9 Bestehendes Docker-Netzwerk ermitteln (wichtig!)**
```
docker network ls
docker inspect ocpp-caddy | grep -A 2 "Networks"
```
- Du siehst den Netz-Namen, z.B. `ocpp-persistent-server_ocppnet`
- Diesen Namen in `/opt/aicono/ocpp-staging/docker-compose.yml` ganz unten unter `networks:` als `external: true / name: <gefundener-name>` eintragen
- Beispiel-Block mit Platzhalter wird in der Anleitung gezeigt + Hinweis, was genau zu ersetzen ist

**14.10 Caddyfile der Live-Installation erweitern (nur 1 Block hinzufügen)**
- `nano /opt/aicono/<live-ordner>/Caddyfile`
- Genau diesen Block **ans Ende** anfügen:
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
- Speichern, dann Caddy neu laden:
  ```
  docker exec ocpp-caddy caddy reload --config /etc/caddy/Caddyfile
  ```
- Erwartete Ausgabe: keine Fehlermeldung. (Falls Fehler: Block wieder löschen, melden.)

**14.11 Staging-Container bauen und starten**
```
cd /opt/aicono/ocpp-staging
docker compose up -d --build
```
- Dauer: 2-5 Minuten beim ersten Mal
- Erwartete letzte Zeile: `Container ocpp-server-staging  Started`
- Prüfen: `docker ps` → drei Container „Up": `ocpp-server`, `ocpp-server-staging`, `ocpp-caddy`

**14.12 Logs der Staging-Bridge ansehen**
```
docker logs --tail 50 ocpp-server-staging
```
Erwartete Zeilen u.a.: `Startup check OK for testbox01`, `Listening on :8080`.
Fehlt der Startup-Check → Anon-Key falsch in 14.7 → korrigieren, dann `docker compose up -d --build` erneut.

**14.13 HTTPS-Test im PuTTY**
```
curl -sf https://ocpp.aicono.org/health
curl -sf https://staging-ocpp.aicono.org/health
```
Beide müssen exakt antworten mit `{"status":"ok",...}`.
Falls Staging fehlschlägt → Caddy 60 Sekunden Zeit fürs Let's-Encrypt-Zertifikat geben, dann erneut testen. Sonst: `docker logs --tail 80 ocpp-caddy | grep -i staging`.

**14.14 Funktionstest mit dem Simulator in Lovable**
- Browser → Lovable-Preview → `/super-admin/ocpp/simulator`
- Server-URL: `wss://staging-ocpp.aicono.org/`
- Wallbox `testbox01` → **Verbinden**
- Erwartet: `Connected (subprotocol: ocpp1.6)`, bleibt ≥ 30 Sek stabil

**14.15 Wallboxen zuordnen (welche URL bedeutet welche Umgebung?)**

| Wallbox-Typ | OCPP-URL in der Wallbox eintragen | Daten landen in |
|---|---|---|
| Echte Live-Wallbox | `wss://ocpp.aicono.org/<seriennr>` | Live-Supabase (91.99.170.143) |
| Simulator/Lovable-Test | `wss://staging-ocpp.aicono.org/<seriennr>` | Lovable-Cloud |

**Antwort auf deine Frage „Wie sage ich der Bridge, wohin sie sich verbindet?":**
Das steht in der jeweiligen `.env` unter `SUPABASE_URL`. Live-Bridge → 91.99.170.143-Supabase. Staging-Bridge → Lovable-Cloud. Die **Wallbox** entscheidet über die URL, an welche Bridge sie sich verbindet — die Bridge entscheidet über ihre `.env`, in welche Datenbank sie schreibt.

## Zusätzlicher neuer Abschnitt 14.16: "Updates einspielen — der sichere Weg"

Drei klar getrennte Mini-Anleitungen mit exakten Copy-Paste-Blöcken:

**A) Nur Staging updaten (immer ZUERST testen):**
```
cd /opt/aicono/aicono-ems && git pull
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/ocpp-staging/
cd /opt/aicono/ocpp-staging && docker compose up -d --build
docker logs --tail 30 ocpp-server-staging
```
Erfolg: Letzte Log-Zeilen ohne `error`, Simulator verbindet sich weiterhin.

**B) Live updaten (erst NACH erfolgreichem Staging-Test):**
```
cd /opt/aicono/aicono-ems && git pull
cp -r /opt/aicono/aicono-ems/docs/ocpp-persistent-server/. /opt/aicono/<live-ordner>/
cd /opt/aicono/<live-ordner> && docker compose up -d --build
docker logs --tail 30 ocpp-server
```
(`<live-ordner>` durch den in 14.5 ermittelten Namen ersetzen.)

**C) Notfall: Staging anhalten (Live läuft weiter unberührt):**
```
cd /opt/aicono/ocpp-staging && docker compose down
```

## Was ich NICHT anfasse

- Keine Änderung an `/opt/aicono/<live-ordner>/.env`
- Keine Umbenennung der Live-Container
- Kein neues Docker-Netzwerk (Staging tritt dem bestehenden bei)
- Caddyfile wird nur **erweitert**, der bestehende `ocpp.aicono.org`-Block bleibt unverändert
- Der Energiemanagement-Server **91.99.170.143** wird überhaupt nicht angefasst

## Was du mir noch sagen musst, bevor ich die Anleitung schreibe

Damit die `.env` für Staging vollständig wird, brauche ich genau **eine** Info — die ich dir auch holen helfe:

**Frage:** Soll die Staging-Bridge auf die Lovable-Cloud zugreifen (also `https://xnveugycurplszevdxtw.supabase.co`, Anon-Key ist mir bekannt)?
→ Falls **ja** (Standardfall), kann ich die `.env` komplett ausgefüllt in die Anleitung schreiben. Du musst dann gar nichts mehr eintippen, nur einfügen.
→ Falls **nein**, sag mir bitte, welche Supabase-URL stattdessen rein soll.

Sobald du das bestätigst (oder einfach „ja"), schreibe ich die komplette Anleitung in `ANLEITUNG_HETZNER_DEPLOY.md` und aktualisiere die `.docx`-Datei automatisch mit.

## Geänderte Datei

- `docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md` (kompletter Neu-Schreib von Schritt 14)
