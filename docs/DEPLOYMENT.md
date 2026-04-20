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
