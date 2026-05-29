# Master Recovery — Notfall-Zugang für Super-Admin

## Wofür ist das?

Wenn auf der Live-Umgebung (Lovable Cloud oder Hetzner-Server) **kein Super-Admin mehr existiert** oder du dich ausgesperrt hast, legt diese Funktion einen **neuen, reinen Plattform-Super-Admin** an — ganz ohne UI, nur mit einem geheimen Schlüssel.

## Strikte Trennung Super-Admin ↔ Tenant

Diese Funktion legt **immer einen reinen Plattform-User** an (`tenant_id = NULL`). Sie wird **niemals** einen bestehenden Tenant-User zum Super-Admin befördern.

- E-Mail noch nicht registriert → neuer User wird angelegt, Einmal-Passwort (OTP) wird zurückgegeben.
- E-Mail existiert bereits **als Tenant-User** → **Fehler 409**, andere E-Mail verwenden.
- E-Mail existiert bereits als **Plattform-User** (kein Tenant) → nur die `super_admin`-Rolle wird bestätigt, **Passwort bleibt unverändert**.

## Voraussetzungen

1. Du brauchst den geheimen Schlüssel `MASTER_RECOVERY_KEY` (in 1Password / Bitwarden gespeichert).
2. Du brauchst ein Terminal mit `curl` (auf macOS und Linux vorinstalliert, unter Windows: PowerShell oder Git Bash).

## So rufst du die Funktion auf

### Lovable Cloud (aktuell)

```bash
curl -X POST https://xnveugycurplszevdxtw.supabase.co/functions/v1/master-recovery \
  -H "x-master-key: DEIN-GEHEIMER-KEY-HIER" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aicono.de"}'
```

### Hetzner-Server (nach Roll-Out)

```bash
curl -X POST https://ems-pro.aicono.org/functions/v1/master-recovery \
  -H "x-master-key: DEIN-GEHEIMER-KEY-HIER" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aicono.de"}'
```

### Antwort bei Neuanlage (Erfolg)

```json
{
  "success": true,
  "created": true,
  "email": "admin@aicono.de",
  "one_time_password": "Xy7k!p2Qm9aB4nVz",
  "message": "Bitte sofort einloggen und Passwort ändern. Dieses Passwort wird nicht erneut angezeigt."
}
```

**WICHTIG:** Das `one_time_password` wird **nur dieses eine Mal** angezeigt. Sofort in 1Password speichern oder direkt einloggen.

### Antwort bei bestehendem Plattform-User

```json
{
  "success": true,
  "created": false,
  "email": "admin@aicono.de",
  "message": "Super-Admin-Rolle bestätigt (Passwort wurde nicht geändert)"
}
```

Hier wurde **kein** neues Passwort gesetzt. Falls vergessen → reguläres „Passwort vergessen" auf `/auth`.

### Erster Login

1. Auf `/auth` mit der E-Mail und dem OTP einloggen.
2. Die App erkennt automatisch das Flag `must_change_password: true` und leitet auf `/set-password` weiter.
3. Neues Passwort vergeben → das Flag wird automatisch entfernt → Weiterleitung in den Super-Admin-Bereich.

### Häufige Fehler

| HTTP | Bedeutung | Lösung |
|------|-----------|--------|
| `401 Unauthorized` | Falscher Key | Key aus 1Password prüfen |
| `409 E-Mail gehört bereits zu einem Tenant` | Die E-Mail ist bereits einem Tenant zugeordnet | Andere, neue E-Mail verwenden — niemals Tenant + Super-Admin vermischen |
| `429 Zu viele Versuche` | Mehr als 5 Aufrufe in 1 Stunde von dieser IP | 1 Stunde warten |
| `500` | Server-Fehler | `detail`-Feld prüfen oder Logs einsehen |

## Sicherheits-Regeln

1. **Den Key NIEMALS in Slack, E-Mail oder Chat schicken.** Nur in einem Passwort-Manager speichern.
2. **Jeder Aufruf wird geloggt** (Tabelle `master_recovery_log`). Auch Fehlversuche.
3. **Nur Super-Admins** können das Log einsehen.
4. Bei Verdacht auf Kompromittierung → **Key rotieren** (siehe unten).

## Key rotieren

1. In Lovable Cloud: **Project Settings → Secrets → `MASTER_RECOVERY_KEY`** → neuen Wert eintragen (mindestens 64 Zeichen, zufällig).
2. Neuen Wert sofort im Passwort-Manager speichern.
3. Auf Hetzner: `MASTER_RECOVERY_KEY` in der `.env`-Datei des Docker-Compose-Setups aktualisieren und Edge-Function-Container neu starten.

## Hetzner-Deployment-Hinweis

In der `docker-compose.yml` bzw. `.env` des Self-Hosted-Supabase-Stacks muss derselbe Wert gesetzt sein:

```env
MASTER_RECOVERY_KEY=DEIN-GEHEIMER-KEY-HIER
```

Die Edge Function läuft dann ohne Code-Anpassung identisch.

## Was die Funktion NICHT kann

- **Keine Tenant-User befördern** — strikte Trennung. Wer Tenant ist, bleibt Tenant.
- **Keine Rolle entziehen** — Entzug erfolgt regulär über das Super-Admin-Backend.
- **Kein Passwort-Reset für bestehende Plattform-User** — dafür „Passwort vergessen" auf `/auth` nutzen.
- **Keine UI in der App** — bewusst, um die Angriffsfläche zu minimieren.
