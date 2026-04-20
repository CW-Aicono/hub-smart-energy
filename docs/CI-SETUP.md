# CI-Setup (einmalig, manuell)

Diese Datei fasst alle Schritte zusammen, die **vor dem ersten automatischen
Deploy** erledigt werden müssen. Danach macht `deploy-prod.yml` alles allein.

> Alle Schritte macht **David**, nicht der Kunde.

## Voraussetzung

Die Dateien `.github/workflows/deploy-prod.yml`, `scripts/deploy.sh`,
`scripts/apply-migrations.sh`, `scripts/rollback.sh`, `docs/GO-LIVE.md` und
dieser Datei müssen **auf `main` gemergt sein**, bevor die Schritte unten
Sinn ergeben. Vorgehen:

```bash
# aktuell auf feature/deployment
git checkout main
git pull
git merge feature/deployment     # oder: git merge <branch mit den CI-Files>
git push origin main
```

---

## 1. Staging-Branch in GitHub anlegen

Lokal, vom aktuellen `main`:

```bash
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

---

## 2. Lovable umstellen

Lovable-Projekt öffnen → **Settings** → **Git** (oder "GitHub Integration") →
**Target Branch** auf `staging` setzen → speichern.

Verifikation: eine triviale Änderung in Lovable machen und prüfen, dass der
Commit auf `origin/staging` landet, **nicht** auf `main`.

---

## 3. Branch-Protection auf `main`

GitHub → **Settings → Branches → Add rule** für `main`:

- [x] **Require a pull request before merging** → **deaktivieren** (wir nutzen
      keinen PR-Flow, sondern den Workflow-Bot).
- [x] **Do not allow bypassing the above settings** → deaktiviert.
- [x] **Restrict who can push to matching branches** → nur `github-actions[bot]`
      und David. Kunde darf nicht.
- [x] **Require linear history** → an (passt zum FF-Merge).

Das verhindert, dass Lovable (oder jemand anders) versehentlich direkt auf
`main` pusht.

---

## 4. Deploy-SSH-Key erzeugen

**Nicht** den persönlichen Key benutzen. Auf dem eigenen Rechner:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/hub_deploy -N '' -C 'github-deploy'
```

Den **Public Key** auf den Hetzner-Server in `root`s `authorized_keys`
eintragen (am besten mit Kommando-Restriction):

```bash
ssh root@91.99.170.143 'cat >> /root/.ssh/authorized_keys' < ~/.ssh/hub_deploy.pub
```

Optional härter (schränkt den Key auf genau das Deploy-Skript ein):

```
command="cd /opt/hub-smart-energy && ./scripts/deploy.sh ${SSH_ORIGINAL_COMMAND##* }",no-port-forwarding,no-X11-forwarding,no-agent-forwarding <pubkey>
```

Den **Private Key** (`~/.ssh/hub_deploy`, Inhalt mit `cat ~/.ssh/hub_deploy`)
gleich in Schritt 5 in GitHub eintragen.

---

## 5. GitHub-Secrets setzen

GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

Folgende Secrets anlegen:

| Name | Wert |
|---|---|
| `SSH_PRIVATE_KEY` | Inhalt von `~/.ssh/hub_deploy` (inkl. `-----BEGIN`-Zeile) |
| `SSH_HOST` | `91.99.170.143` |
| `SSH_USER` | `root` |
| `SSH_PORT` | `22` (optional, default) |
| `VITE_SUPABASE_URL` | **Self-hosted** URL (z.B. `https://ems.aicono.org`) — *nicht* die Lovable-Cloud-URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Self-hosted Anon-Key (aus `/opt/hub-smart-energy/supabase-docker/.env` → `ANON_KEY`) |
| `VITE_CSP_CONTENT` | CSP-String aus aktueller Server-`.env` |

> Warnung: die Keys im Frontend-Build **müssen** die Self-Hosted-Werte sein,
> nicht die Lovable-Cloud-Werte. Sonst verbindet sich die Prod-App mit der
> Lovable-Cloud-DB.

---

## 6. GHCR-Login auf dem Hetzner-Server

Damit `docker pull ghcr.io/...` auf dem Server funktioniert:

```bash
ssh root@91.99.170.143
```

Dort einen **Personal Access Token (classic)** mit Scope `read:packages` bei
GitHub generieren (`github.com/settings/tokens`), dann:

```bash
echo 'ghp_xxxxxxxxxxxxxxxxxxxx' | docker login ghcr.io -u <github-user> --password-stdin
```

Das Login wird in `/root/.docker/config.json` gespeichert und ist persistent.

Test:

```bash
docker pull ghcr.io/cw-aicono/hub-smart-energy:latest
```

(Muss erst laufen, sobald der erste CI-Build gepusht hat.)

---

## 7. Skripte auf den Server bringen

Einmalig `main` auf dem Server aktualisieren:

```bash
ssh root@91.99.170.143
cd /opt/hub-smart-energy
git fetch origin main
git reset --hard origin/main
chmod +x scripts/*.sh
```

---

## 8. Migrations-Bootstrap (WICHTIG)

Da auf Prod bereits alle 209 bestehenden Migrations appliziert sind, müssen
sie **einmalig als "applied" markiert** werden — sonst würde der erste Deploy
versuchen, sie erneut auszuführen und scheitern.

Auf dem Server:

```bash
cd /opt/hub-smart-energy
BOOTSTRAP=1 ./scripts/apply-migrations.sh
```

Das legt die Tabelle `public._deploy_migrations` an und trägt alle aktuell
vorhandenen `.sql`-Dateien als appliziert ein, **ohne sie auszuführen**.

Verifikation:

```bash
docker exec -it supabase-db psql -U postgres -d postgres \
  -c "SELECT count(*) FROM public._deploy_migrations;"
```

Sollte der Zahl der Dateien in `supabase/migrations/` entsprechen (aktuell ~209).

---

## 9. Kunden-Account in GitHub

- Kunden zur Organisation `CW-Aicono` einladen mit Rolle **Write** (nicht Admin).
- Ihm den Link zu `docs/GO-LIVE.md` schicken.
- Einmal gemeinsam durchklicken.

---

## 10. Dry-Run-Test

**Vor dem ersten echten Deploy**: manuell auf dem Server einen Dry-Run:

```bash
ssh root@91.99.170.143
cd /opt/hub-smart-energy
./scripts/deploy.sh <current-short-sha>
```

(`current-short-sha` = `git rev-parse --short HEAD`.)

Erwartung: läuft durch, 0 neue Migrations, Image-Pull no-op wenn SHA = latest.
Falls nicht: Fehler analysieren, bevor der Kunde den Button klickt.

---

## 11. Erster Live-Test

- Triviale Änderung in Lovable (z.B. Footer-Text).
- Lovable pusht auf `staging`.
- David klickt den Workflow-Button selbst einmal (als Vertretung für den Kunden).
- Prüft: grüner Workflow, Live-Seite zeigt neue Version, Backup-Datei existiert,
  `docker logs supabase-caddy` sauber.
- **Rollback-Test**: kaputte Migration auf `staging` → Button → Workflow rot →
  Prod unverändert → Backup existiert.

Erst nach diesen beiden Tests an den Kunden freigeben.
