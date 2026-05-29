# Master-Recovery v2 — Reiner Super-Admin-Account

## Problem mit v1

Die bisherige Funktion befördert eine bestehende E-Mail zum `super_admin`. Wenn diese E-Mail aber bereits einem Tenant zugeordnet ist (z. B. als Tenant-Admin), hätte derselbe User Zugriff auf **beide** Welten. Das verletzt die strikte Trennung Super-Admin ↔ Tenant.

## Neues Verhalten

Die Edge Function `master-recovery` legt einen **neuen, reinen Plattform-User** an:

1. **E-Mail muss noch nicht existieren** in `auth.users`.
  - Falls die E-Mail bereits existiert **und einem Tenant zugeordnet ist** → Fehler `409 Email gehört bereits zu einem Tenant — bitte andere E-Mail verwenden`.
  - Falls die E-Mail bereits existiert **und kein Tenant zugeordnet** (also schon Plattform-User) → bestehende Rolle wird auf `super_admin` gesetzt/bestätigt, Passwort wird **nicht** geändert.
2. Falls neu: User wird per `auth.admin.createUser` angelegt mit:
  - `email_confirm: true`
  - **Einmal-Passwort (OTP)** — 16 Zeichen, zufällig, im Response zurückgegeben (nur einmal sichtbar)
  - `user_metadata.must_change_password = true`
3. `profiles`-Eintrag wird angelegt mit `tenant_id = NULL` (= Plattform-User).
4. Eintrag in `user_roles` mit Rolle `super_admin`.
5. Audit-Log in `master_recovery_log` (existiert bereits).

## Aufruf

```bash
curl -X POST https://xnveugycurplszevdxtw.supabase.co/functions/v1/master-recovery \
  -H "x-master-key: <MASTER_RECOVERY_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aicono.de"}'
```

Erfolgs-Antwort bei Neuanlage:

```json
{
  "success": true,
  "created": true,
  "email": "admin@aicono.de",
  "one_time_password": "Xy7k!p2Qm9aB4nVz",
  "message": "Bitte sofort einloggen und Passwort ändern. Dieses Passwort wird nicht erneut angezeigt."
}
```

Erfolgs-Antwort bei bestehendem Plattform-User:

```json
{ "success": true, "created": false, "message": "Super-Admin-Rolle bestätigt" }
```

## Passwort-Wechsel-Zwang beim ersten Login

- Beim Login prüft die App `user_metadata.must_change_password`.
- Wenn `true` → Redirect auf `/set-password` (Seite existiert bereits).
- Nach erfolgreichem `updateUser({ password, data: { must_change_password: false } })` wird das Flag entfernt.

Dafür kleine Ergänzung in `src/pages/Index.tsx` (oder einem zentralen Auth-Guard): nach `getUser()` prüfen, ob `user.user_metadata?.must_change_password === true` → `navigate("/set-password")`.

## Was angepasst werden muss

1. `**supabase/functions/master-recovery/index.ts**` — komplett überarbeiten:
  - Tenant-Check via `profiles.tenant_id IS NOT NULL` → 409 abbrechen
  - `createUser` mit zufälligem OTP
  - `profiles`-Insert mit `tenant_id = NULL`
  - OTP im Response zurückgeben
2. `**docs/MASTER_RECOVERY.md**` — aktualisieren:
  - Neue Semantik (legt User an, nicht befördern)
  - OTP-Workflow
  - Fehler `409 Email gehört zu einem Tenant`
3. **Auth-Guard für `must_change_password**` — kleine Erweiterung in `Index.tsx`/Auth-Flow, Redirect auf `/set-password`.
4. **Keine DB-Migration nötig** — `master_recovery_log` reicht.

## Sicherheits-Eigenschaften

- Kein bestehender Tenant-User kann „nebenbei" zum Super-Admin gemacht werden (strikte Trennung bleibt gewahrt).
- OTP ist nur einmal sichtbar (sofort in 1Password speichern).
- Erstes Login erzwingt Passwort-Wechsel.
- Rate-Limit (5/h pro IP) und Audit-Log bleiben aktiv.

## Offene Frage an dich

Soll bei einer **bereits existierenden Plattform-E-Mail ohne Tenant** (Fall 2 oben):

- (a) nur die Rolle bestätigt werden (kein neues Passwort), **oder**
- (b) zusätzlich ein neues OTP gesetzt werden (= „Passwort-Reset für Super-Admin")?

Default-Vorschlag: **(a)** — sicherer, da kein versehentlicher Passwort-Overwrite. Reset läuft regulär über „Passwort vergessen".  
  
Antwort: Option (a) umsetzen

&nbsp;