# Deployment

Produktiv-Server: `ems.aicono.org` (`91.99.170.143`)
Pfad auf dem Server: `/opt/hub-smart-energy`

## Überblick

- **Staging:** Lovable-Branch `staging` auf GitHub. Jede Änderung in Lovable
  landet hier. Vorschau sieht der Kunde in Lovable.
- **Produktion:** Branch `main`. Wird **nur vom GitHub-Actions-Workflow**
  `deploy-prod.yml` aktualisiert (Fast-Forward-Merge von `staging`).
- **Go-Live-Button:** `github.com/CW-Aicono/hub-smart-energy/actions/workflows/deploy-prod.yml`
  → "Run workflow" → im Bestätigungs-Feld `LIVE` eintippen → grüner Button.
- Kunden-Anleitung: siehe [`GO-LIVE.md`](./GO-LIVE.md).

## Was der Workflow automatisch macht

1. Fast-Forward-Merge `staging` → `main` (bricht ab, wenn nicht FF-möglich).
2. Baut Frontend-Docker-Image und pusht nach `ghcr.io/cw-aicono/hub-smart-energy`.
3. SSH → Server → `scripts/deploy.sh <sha>`:
   - `pg_dumpall` → `/opt/hub-smart-energy/backups/<timestamp>.sql`
   - `git fetch + reset --hard origin/main`
   - `scripts/apply-migrations.sh` spielt neue SQLs aus `supabase/migrations/`
   - `docker pull` + `docker compose up -d frontend functions`
   - `curl` Healthcheck auf `https://ems.aicono.org/`
   - Bei jedem Fehler: automatisches `scripts/rollback.sh` (DB + Code zurück).

## DB-Aenderungen: nur per Migration, nie per Studio-UI/SQL-Editor

`deploy-prod.yml` synct ausschliesslich Dateien aus dem Git-Tree von `staging`
nach `main` (siehe oben). **Jede** Datenbank-Aenderung, die in Lovable/staging
direkt im Supabase-Studio (SQL-Editor, Table-Editor, `Database` → `Cron Jobs`
o.ae.) gemacht wird, landet **nirgendwo im Repo** — egal ob Tabelle, Spalte,
Funktion, RLS-Policy, Trigger oder pg_cron-Job. Sie existiert nur live in der
staging-Cloud-DB und wird durch keinen Deploy je nach Prod uebertragen, egal
wie oft "Go-Live" gedrueckt wird.

**Regel:** Jede Aenderung am DB-Schema und an pg_cron-Jobs (neu anlegen,
aendern, loeschen) muss als SQL-Migration in `supabase/migrations/` erfolgen,
nicht direkt im Studio-UI/SQL-Editor. Nur Migrationen werden von
`deploy-prod.yml` nach `main` gemerged und von `scripts/apply-migrations.sh`
auf dem Server ausgefuehrt. Das gilt auch fuer Lovable-generierte Aenderungen:
Lovable schreibt Schema-Aenderungen normalerweise selbst als Migration — wird
trotzdem manuell im SQL-Editor nachgebessert (schneller Fix, Backfill,
einzelner Cronjob), muss dieser Schritt nachtraeglich als eigene Migration
nachgezogen werden, sonst geht er beim naechsten Deploy verloren.

**Drift pruefen:** `scripts/check-cron-drift.sh` vergleicht den in den
Migrationen definierten Stand (pg_cron-Jobs ODER `public.permissions`,
je nach Modus) mit dem tatsaechlichen Stand einer laufenden DB. Gegen
staging ausfuehren, um Eintraege zu finden, die nur dort per UI angelegt
wurden (und so nie nach Prod kommen wuerden); gegen Prod nach einem Deploy
ausfuehren, um zu pruefen, dass alles Erwartete auch wirklich da/aktiv ist:

```bash
# Cron-Jobs, gegen den lokal erreichbaren Container (z.B. Hetzner-Server):
./scripts/check-cron-drift.sh cron docker exec -i supabase-db psql -U supabase_admin -d postgres

# Cron-Jobs, gegen eine Cloud-DB (z.B. Lovable-Staging) per Connection-String:
./scripts/check-cron-drift.sh cron psql "postgresql://user:pass@host:5432/postgres"

# Permissions-Katalog, gleiches Schema, anderer Modus:
./scripts/check-cron-drift.sh permissions docker exec -i supabase-db psql -U supabase_admin -d postgres
./scripts/check-cron-drift.sh permissions psql "postgresql://user:pass@host:5432/postgres"
```

## Einmaliges Setup

Siehe [`CI-SETUP.md`](./CI-SETUP.md). Fasst Lovable-Konfiguration, GitHub-Secrets,
Deploy-SSH-Key, GHCR-Login auf dem Server und Migrations-Bootstrap zusammen.

## Manuelles Fallback-Deploy (nur wenn GitHub Actions down ist)

```bash
ssh root@91.99.170.143
cd /opt/hub-smart-energy
git fetch origin main && git reset --hard origin/main
./scripts/apply-migrations.sh
cd supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build frontend functions
```

## .env auf dem Server pflegen

Die `.env` liegt unter `/opt/hub-smart-energy/supabase-docker/.env` und wird
**nie ins Git eingecheckt**. Vorlage: `.env.example`.

Wichtige Variablen:

| Variable | Beschreibung |
|---|---|
| `RESEND_API_KEY` | Resend API-Key (`re_…`) für E-Mail-Versand |
| `RESEND_FROM_EMAIL` | Absender (z.B. `info@aicono.org`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | GoTrue SMTP (Resend: `smtp.resend.com:465`, User `resend`) |
| `POSTGRES_PASSWORD` | Datenbank-Passwort |
| `JWT_SECRET` | JWT-Signierschlüssel |

Änderungen an `.env` erfordern ein Container-Restart:

```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml restart functions
# falls SMTP/Auth geändert:
docker compose -f docker-compose.yml -f docker-compose.caddy.yml restart auth
```

## Logs & Debugging

```bash
docker ps
docker logs supabase-functions -f
docker logs supabase-auth -f
docker logs supabase-kong -f
docker logs supabase-caddy -f

# Datenbank
docker exec -it supabase-db psql -U postgres -d postgres -P pager=off
```

## E-Mail via Resend (Ersteinrichtung)

1. Account auf [resend.com](https://resend.com) anlegen.
2. **API Keys** → **Create API Key** → Scope `Sending access` → Key kopieren.
3. **Domains** → **Add Domain** → `aicono.org` → DNS-Records (TXT/DKIM) eintragen
   und Verifikation abwarten (5–15 Min).
4. `.env` auf dem Server ergänzen:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   RESEND_FROM_EMAIL=info@aicono.org
   ```
   Optional für GoTrue-Auth-Mails:
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx
   SMTP_SENDER_NAME=AICONO
   ```
5. `functions` (und ggf. `auth`) neu starten (siehe oben).
6. Test: Super Admin → Users → "Nutzer einladen" → Logs prüfen.
   Erwartet: `200 OK` von Resend. Fehler `403` = Domain nicht verifiziert,
   `401` = Key falsch / Container nicht neu gestartet.

---

## Subdomain sales.aicono.org (Sales Scout PWA)

Die Sales-Scout-PWA für Vertriebspartner läuft unter einer eigenen Subdomain.
Sie zeigt die gleiche App wie ems-pro.aicono.org, leitet aber nach dem Login
automatisch auf `/sales` weiter (Erkennung in `src/lib/hostname.ts → isSalesHost()`).

So richtest du die Subdomain Schritt für Schritt ein:

### 1. DNS-Eintrag setzen

Im DNS-Provider (z. B. Hetzner DNS Console, Cloudflare) für die Zone `aicono.org`:

| Typ   | Name  | Wert / Ziel               | TTL  |
|-------|-------|---------------------------|------|
| A     | sales | `<Server-IPv4>`           | 300  |
| AAAA  | sales | `<Server-IPv6>` (optional)| 300  |

Kontrolle:
```bash
dig +short sales.aicono.org
```
Erwartung: Es kommt die IP deines Hetzner-Servers zurück. Wenn nicht, 5–15 Min
warten (DNS-Propagation).

### 2. Traefik-Label am App-Container erweitern

In `docker-compose.yml` beim Frontend-/App-Service den Host-Router um die neue
Subdomain ergänzen. Beispiel:

```yaml
services:
  app:
    image: ghcr.io/cw-aicono/aicono-ems:latest
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app.rule=Host(`ems-pro.aicono.org`) || Host(`partner.aicono.org`) || Host(`sales.aicono.org`)"
      - "traefik.http.routers.app.entrypoints=websecure"
      - "traefik.http.routers.app.tls=true"
      - "traefik.http.routers.app.tls.certresolver=letsencrypt"
      - "traefik.http.services.app.loadbalancer.server.port=80"
```

Wichtig:
- Die **gleiche Container-Instanz** bedient alle drei Hosts. Die Weiterleitung
  auf `/sales` macht die App selbst (siehe `src/pages/Index.tsx`).
- Wenn du Caddy statt Traefik nutzt, im `Caddyfile` einfach
  `sales.aicono.org` als zusätzlichen Site-Block mit `reverse_proxy app:80`
  ergänzen — Let's-Encrypt-Zertifikat zieht Caddy automatisch.

### 3. Container neu laden

```bash
cd /opt/aicono
docker compose up -d
docker compose logs -f traefik | grep -i sales
```
Erwartung: Traefik meldet `Configuration loaded` und holt automatisch ein
Let's-Encrypt-Zertifikat für `sales.aicono.org` (kann beim ersten Aufruf 10–30 s
dauern).

### 4. Test

1. Im Browser `https://sales.aicono.org` öffnen → grünes Schloss prüfen.
2. Mit einem Partner-Account einloggen → Weiterleitung auf `/sales`.
3. Auf iPhone/iPad: Safari → Teilen-Menü → „Zum Home-Bildschirm“.
   Erwartung: App-Icon „Sales Scout“, Vollbild-Start, Safe-Area oben sichtbar
   (Header schiebt sich unter die Notch).
4. Dev-Override ohne DNS (Lovable Preview):
   `https://<preview-url>/?sales=1` → setzt Session-Flag und verhält sich
   wie die echte Subdomain.

### 5. Troubleshooting

| Symptom                                   | Ursache / Fix                                                         |
|-------------------------------------------|-----------------------------------------------------------------------|
| `ERR_CERT_AUTHORITY_INVALID`              | Let's Encrypt noch nicht erteilt – 1–2 Min warten, Logs prüfen.       |
| 404 von Traefik                           | Host-Regel falsch geschrieben (Backticks!), Service neu deployen.     |
| Login funktioniert nicht                  | Supabase Auth → „Redirect URLs“ um `https://sales.aicono.org/**` ergänzen. |
| Safe-Area oben fehlt im PWA-Modus         | App erneut zum Home-Bildschirm hinzufügen (Manifest wird neu gecacht).|
