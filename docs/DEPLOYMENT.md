# Deployment – Server-Update & Verbindung

Produktiv-Server: `ems.aicono.org`
Pfad auf dem Server: `/opt/hub-smart-energy`

---

## 1. SSH-Verbindung

```bash
ssh root@91.99.170.143
```

Oder via Hostname (falls DNS-Eintrag vorhanden):
```bash
ssh root@ems.aicono.org
```

---

## 2. Code-Update deployen

```bash
cd /opt/hub-smart-energy
git pull
```

---

## 3. Container neu bauen / starten

### Nur Env-Vars geändert (z.B. neuer API-Key) — kein Rebuild nötig:
```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml restart functions
```

### Code der Edge Functions geändert — Rebuild nötig:
```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build functions
```

### Frontend geändert — Rebuild nötig:
```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build frontend
```

### GoTrue-Auth-Config geändert (SMTP, Auth-Settings in .env):
```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml restart auth
```

### Alles neu starten:
```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

---

## 4. .env auf dem Server pflegen

Die `.env`-Datei wird **nie ins Git eingecheckt** und muss manuell gepflegt werden:

```bash
cd /opt/hub-smart-energy/supabase-docker
nano .env
```

Vorlage: `.env.example` (im Repo, immer aktuell halten).

### Wichtige Variablen

| Variable | Beschreibung |
|---|---|
| `RESEND_API_KEY` | Resend API-Key (`re_...`) für E-Mail-Versand |
| `RESEND_FROM_EMAIL` | Absender-Adresse (z.B. `info@aicono.org`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | GoTrue SMTP (Resend: `smtp.resend.com`, Port `465`, User `resend`) |
| `POSTGRES_PASSWORD` | Datenbank-Passwort |
| `JWT_SECRET` | JWT-Signierschlüssel |

---

## 5. E-Mail via Resend einrichten (Ersteinrichtung)

### A — Resend-Account & Domain

1. [resend.com](https://resend.com) → Account anlegen
2. **API Keys** → **Create API Key** → Name `hub-smart-energy-prod`, Scope `Sending access` → Key kopieren (`re_...`)
3. **Domains** → **Add Domain** → `aicono.org`
4. DNS-Records (TXT/DKIM) beim DNS-Provider für `aicono.org` eintragen
5. Warten bis Status grün (5–15 Min)

### B — .env auf dem Server ergänzen

```bash
nano /opt/hub-smart-energy/supabase-docker/.env
```

Eintragen:
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=info@aicono.org
```

Optional — GoTrue-eigene Auth-Mails (Passwort-Reset-Links von Supabase):
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx
SMTP_SENDER_NAME=AICONO
```

### C — Container neu bauen & starten

```bash
cd /opt/hub-smart-energy/supabase-docker
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build functions
# falls SMTP geändert:
docker compose -f docker-compose.yml -f docker-compose.caddy.yml restart auth
```

### D — Test

1. App öffnen → Super Admin → Users → "Nutzer einladen" → E-Mail eingeben
2. Logs prüfen:
   ```bash
   docker logs supabase-functions --tail=50
   ```
3. Erwartung: `200 OK` von Resend, E-Mail kommt an
4. Fehler `403 Domain not verified` → Domain in Resend noch nicht verifiziert
5. Fehler `401 Unauthorized` → `RESEND_API_KEY` falsch oder Container nicht neu gestartet

---

## 6. Logs & Debugging

```bash
# Alle Container-Status
docker ps

# Logs eines Containers (live)
docker logs supabase-functions -f
docker logs supabase-auth -f
docker logs supabase-kong -f
docker logs supabase-caddy -f

# Datenbank-Zugriff
docker exec -it supabase-db psql -U postgres -d postgres -P pager=off
```
