## Ziel

**Alle Mails — Auth + App — laufen ausschließlich über Resend**, sowohl in Lovable (Staging) als auch auf Hetzner (Live). Supabase Default-SMTP wird vollständig umgangen. Frontend-/Function-Code ist **environment-agnostisch** — der Unterschied zwischen Staging und Live liegt ausschließlich in den Resend-Secrets/Absender-Adressen.

## Aktuelle Lücke

| Mail-Typ | Status |
|---|---|
| Tenant-/Admin-Einladungen, Berichte, Rechnungen, Task-Transfer | Resend ✅ |
| Passwort vergessen | Resend ✅ (`send-auth-email`) |
| **Signup-Bestätigung** (Charging-PWA, Energy-PWA, Hauptapp) | **Supabase Default-SMTP ❌** |
| **Email-Adressänderung** | **Supabase Default-SMTP ❌** |

## Environment-Strategie (Lovable Staging vs. Hetzner Live)

Der gesamte Application-Code (Frontend + Edge Functions) bleibt **identisch** in beiden Umgebungen. Trennung erfolgt nur über Secrets, die pro Umgebung **getrennt** gepflegt werden:

| Secret | Lovable (Staging) | Hetzner (Live) |
|---|---|---|
| `RESEND_API_KEY` | Staging-Resend-Key | **Live-Resend-Key (separater API-Key auf Resend)** |
| `RESEND_FROM_EMAIL` | `info@staging.aicono.org` | **`info@aicono.org`** (verifizierte Live-Domain) |

**Wichtig — kein Code-Pfad referenziert die Umgebung explizit.** Die existierende Helper-Funktion `supabase/functions/_shared/resend-from.ts` liest bereits `RESEND_FROM_EMAIL` aus den Env-Vars. Dadurch:
- GitHub-Push von Lovable → Hetzner deployt nur Code, **keine Secrets**.
- Hetzner behält seinen eigenen Resend-Key + `info@aicono.org` Absender.
- Reply-To wird ebenfalls auf `RESEND_FROM_EMAIL` umgestellt (statt hartcodiert `info@staging.aicono.org`).

### Hartcodierter Reply-To-Fix

In `supabase/functions/send-auth-email/index.ts` ist aktuell `reply_to: "info@staging.aicono.org"` hartcodiert → das **muss** auf `RESEND_FROM_EMAIL` umgestellt werden, sonst geht auf Hetzner Reply-To an die falsche Domain.

→ Suche projektweit nach weiteren hartcodierten `staging.aicono.org`-Vorkommen in `supabase/functions/**` und ersetze sie durch `Deno.env.get("RESEND_FROM_EMAIL")` bzw. `resendFrom(...)`.

## Lösung — drei Bausteine

### 1. Auth-Settings: Default-Confirmation-Mail abschalten

Über `cloud--configure_auth`:
- `mailer_autoconfirm = true` → Supabase legt User direkt verifiziert an, sendet **keine** Mail.
- Wir übernehmen Branding-Mail über Resend selbst.

Gilt für Lovable-Cloud-Supabase **und** für die Hetzner-Self-Hosted-Supabase. Die Hetzner-Supabase muss in `supabase-docker/.env` ebenfalls `MAILER_AUTOCONFIRM=true` (bzw. `GOTRUE_MAILER_AUTOCONFIRM=true`) gesetzt bekommen — das ist eine **einmalige Server-Konfig-Anpassung**, keine Code-Änderung.

### 2. Edge Function `send-auth-email` erweitern

Aktuell produktiv nur `password_reset`. Vollständig ausbauen für:
- `signup_confirm` → `auth.admin.generateLink({ type: "signup", email, password })`
- `email_change` → `auth.admin.generateLink({ type: "email_change_current"/"_new", email, newEmail })`
- `magic_link` → fertig verdrahten

Templates in `_shared/email-templates.ts` existieren bereits (DE/EN/ES/NL).

**Außerdem**: Reply-To dynamisieren (siehe oben).

### 3. Frontend-Aufrufstellen umstellen

Da `mailer_autoconfirm = true` ist, sendet Supabase keine Mail mehr → Signup-Mail aktiv via `send-auth-email` triggern.

**Signup-Flows** (3 Stellen):
- `src/pages/ChargingApp.tsx` `handleRegister` (Zeile 105): nach `signUp()` `send-auth-email` mit `type: "signup_confirm"`, `redirectTo: window.location.origin + "/ev"`.
- `src/pages/TenantEnergyApp.tsx` `handleRegister` (Zeile 116): identisch, `redirectTo: "/te"`.
- `src/hooks/useAuth.tsx` `signUp` (Zeile 78): identisch, `redirectTo: "/"`.

**Email-Change-Flow**: projektweit nach `updateUser({ email })` suchen → falls vorhanden, ebenfalls über `send-auth-email type: "email_change"` umleiten.

**SetPassword & Update-Password** bleiben unverändert (kein Mail-Versand).

## Risiken & Hinweise

- **`mailer_autoconfirm = true` heißt: User gilt sofort als verifiziert**, auch ohne Klick auf den Link. Bewusster Trade-off — alternativ müsste eine eigene `email_confirmed`-Spalte in `profiles` + Login-Guard ergänzt werden (out of scope).
- `auth.admin.generateLink({ type: "signup" })` setzt voraus, dass User in `auth.users` existiert → erst `signUp()`, dann `send-auth-email`.
- Audit-Logging (`email_send_audit`) greift automatisch.
- Rate-Limit (5/min/IP) bleibt aktiv.
- **GitHub-Sync Lovable → Hetzner verändert keine Secrets** — Hetzner-`.env` und Hetzner-Resend-API-Key bleiben isoliert. Nur Code wird gepusht.

## Geänderte Dateien

**Bearbeitet:**
- `supabase/functions/send-auth-email/index.ts` — `signup_confirm` + `email_change` ausbauen, Reply-To dynamisieren
- `src/pages/ChargingApp.tsx` — Signup-Flow
- `src/pages/TenantEnergyApp.tsx` — Signup-Flow
- `src/hooks/useAuth.tsx` — Signup-Flow
- ggf. `src/pages/Profile.tsx` / `src/components/settings/*` — Email-Change-Flow
- Auth-Settings via `cloud--configure_auth`: `mailer_autoconfirm = true` (Lovable)

**Manuell auf Hetzner (einmalig, kein Code-Push):**
- `supabase-docker/.env`: `GOTRUE_MAILER_AUTOCONFIRM=true`
- Verifizieren: `RESEND_API_KEY` (Live-Key) und `RESEND_FROM_EMAIL=info@aicono.org` sind in den Edge-Function-Secrets gesetzt
- Container-Restart von `auth` und Edge-Functions-Runtime

**Keine neuen Dateien.**

## Reihenfolge der Umsetzung

1. `send-auth-email` erweitern (signup_confirm, email_change) + Reply-To dynamisieren.
2. `cloud--configure_auth` → `mailer_autoconfirm = true` (Lovable).
3. Frontend Signup-Aufrufe in 3 Dateien ergänzen.
4. Email-Change-Aufrufe finden und umstellen.
5. End-to-End-Test in Lovable-Preview: Signup aus `/ev`, `/te`, `/auth` — Mail kommt von `info@staging.aicono.org` mit AICONO-Branding.
6. **Hetzner-Side (manuell, dokumentieren)**: `.env` anpassen, Live-Resend-Key + `info@aicono.org` setzen, Container restart, gleicher End-to-End-Test gegen Live-Domain.

## Out of Scope

- Echte Verifikations-Pflicht vor Login (separates Thema, da `mailer_autoconfirm = true` Sofort-Login erlaubt).
- Migration zu Lovable Emails (bleibt bei Resend).
- Bounce-/Complaint-Webhooks.
- Hetzner-Deploy-Automatisierung.
