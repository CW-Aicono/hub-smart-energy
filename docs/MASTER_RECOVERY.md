# Master Recovery — Notfall-Zugang für Super-Admin

## Wofür ist das?

Wenn auf der Live-Umgebung (Lovable Cloud oder Hetzner-Server) **kein Super-Admin mehr existiert** oder du dich ausgesperrt hast, kannst du mit dieser Funktion einen beliebigen registrierten User per E-Mail zum `super_admin` befördern — ohne Login, nur mit einem geheimen Schlüssel.

## Voraussetzungen

1. Der User muss **bereits registriert** sein (Selbst-Registrierung über `/auth` ausreicht).
2. Du brauchst den geheimen Schlüssel `MASTER_RECOVERY_KEY` (in 1Password / Bitwarden gespeichert).
3. Du brauchst ein Terminal mit `curl` (auf macOS und Linux vorinstalliert, unter Windows: PowerShell oder Git Bash).

## So rufst du die Funktion auf

### Lovable Cloud (aktuell)

```bash
curl -X POST https://xnveugycurplszevdxtw.supabase.co/functions/v1/master-recovery \
  -H "x-master-key: DEIN-GEHEIMER-KEY-HIER" \
  -H "Content-Type: application/json" \
  -d '{"email":"deine-email@aicono.de"}'
```

### Hetzner-Server (nach Roll-Out)

```bash
curl -X POST https://ems-pro.aicono.org/functions/v1/master-recovery \
  -H "x-master-key: DEIN-GEHEIMER-KEY-HIER" \
  -H "Content-Type: application/json" \
  -d '{"email":"deine-email@aicono.de"}'
```

### Erwartete Antwort bei Erfolg

```json
{
  "success": true,
  "message": "User deine-email@aicono.de wurde zum super_admin befördert",
  "user_id": "..."
}
```

### Häufige Fehler

| Antwort | Bedeutung | Lösung |
|---------|-----------|--------|
| `401 Unauthorized` | Falscher Key | Key aus 1Password prüfen |
| `404 User nicht gefunden` | E-Mail nicht registriert | Erst über `/auth` registrieren |
| `429 Zu viele Versuche` | Mehr als 5 Aufrufe in 1 Stunde von dieser IP | 1 Stunde warten |

## Wichtige Sicherheits-Regeln

1. **Den Key NIEMALS in Slack, E-Mail oder Chat schicken.** Nur in einem Passwort-Manager speichern.
2. **Jeder Aufruf wird geloggt** (in der Tabelle `master_recovery_log`). Auch Fehlversuche.
3. **Nur Super-Admins** können das Log einsehen.
4. Bei Verdacht auf Kompromittierung → **Key rotieren** (siehe unten).

## Key rotieren

1. In Lovable: **Project Settings → Secrets → `MASTER_RECOVERY_KEY`** → neuen Wert eintragen (mindestens 64 Zeichen, zufällig)
2. Neuen Wert sofort im Passwort-Manager speichern
3. Auf Hetzner: `MASTER_RECOVERY_KEY` in der `.env`-Datei des Docker-Compose-Setups aktualisieren und Edge-Function-Container neu starten

## Hetzner-Deployment-Hinweis

In der `docker-compose.yml` bzw. `.env` des Self-Hosted-Supabase-Stacks muss derselbe Wert gesetzt sein:

```env
MASTER_RECOVERY_KEY=DEIN-GEHEIMER-KEY-HIER
```

Die Edge Function läuft dann ohne Code-Anpassung identisch.

## Was die Funktion NICHT kann

- **Keine Rolle entziehen** — nur Beförderung zu `super_admin`. Entzug erfolgt regulär über das Super-Admin-Backend.
- **Keine Benutzer anlegen** — User muss zuerst registriert sein.
- **Keine UI in der App** — bewusst, um die Angriffsfläche zu minimieren.
