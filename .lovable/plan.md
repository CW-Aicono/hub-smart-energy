## Ziel

Alle ausgehenden Mails laufen einheitlich über **einen Kanal** (Resend mit `info@staging.aicono.org`) und tragen **AICONO-Branding**. Die unbranded Default-Mails von Supabase Auth werden ersetzt.

## Aktuelle Mail-Kanäle (Ist-Zustand)

| Mail-Typ | Aktueller Kanal | Branded? |
|---|---|---|
| Tenant-/Admin-Einladungen | Resend (`activate-invited-user`, `invite-tenant-admin`) | Ja |
| Berichte (PDF/HTML) | Resend (`send-scheduled-report`) | Ja |
| Charging-Rechnungen | Resend (`send-charging-invoices`) | Ja |
| Task-Transfer | Resend (`send-task-transfer-email`) | Ja |
| **Passwort vergessen** | **Supabase Default-SMTP** | **Nein** |
| **Signup-Bestätigung** (Charging-/Energy-PWA) | **Supabase Default-SMTP** | **Nein** |
| **Email-Adressänderung** | **Supabase Default-SMTP** | **Nein** |

Betroffene Aufruferstellen für Auth-Mails:
- `src/pages/Auth.tsx` (Forgot-Password)
- `src/components/settings/ChangePasswordCard.tsx` (Passwort ändern)
- `src/pages/ChargingApp.tsx` (Signup + Forgot)
- `src/pages/TenantEnergyApp.tsx` (Signup + Forgot)
- `src/hooks/useAuth.tsx` (Signup)

## Lösung

### Neuer geteilter Mail-Renderer

Neue Datei `supabase/functions/_shared/email-templates.ts` mit gebrandeten HTML-Templates (AICONO-Logo, Blau-Header, gleiche Optik wie Einladungs-Mail). Templates:
- `passwordReset(url, recipientName?)`
- `signupConfirm(url, recipientName?)`
- `emailChangeConfirm(url, oldEmail, newEmail)`
- `magicLink(url)` (Reserve)

Inline-CSS, weißer Body-Hintergrund, AICONO-Farben (HSL 220 60% 20%), Capsule-Buttons, Footer mit Datenschutz-/Impressum-Links, mehrsprachig (DE-default, EN-Fallback).

### Neue Edge Function `send-auth-email`

Datei: `supabase/functions/send-auth-email/index.ts`, `verify_jwt = false` (in `config.toml` registrieren).

**Input:**
```ts
{ type: "password_reset" | "signup_confirm" | "email_change" | "magic_link",
  email: string, redirectTo?: string, locale?: "de"|"en"|"es"|"nl",
  templateData?: Record<string, unknown> }
```

**Ablauf:**
1. JWT-Validierung **nur** für `password_reset` mit existierendem User optional — die Funktion ist für nicht eingeloggte User (Forgot-Password, Signup) erreichbar. Schutz via Rate-Limit (in-memory pro IP, 5/min) + E-Mail-Format-Validierung (Zod).
2. Service-Role-Client erstellen.
3. Via `auth.admin.generateLink({ type, email, options: { redirectTo } })` den Magic-/Recovery-Link generieren.
4. Wenn der User nicht existiert (bei `password_reset`): **kein** Fehler nach außen (Information-Disclosure-Schutz), aber kein Versand.
5. Template rendern → Resend-Send via `RESEND_API_KEY` mit `From: "AICONO <info@staging.aicono.org>"` (über `_shared/resend-from.ts`).
6. Reply-To: `info@staging.aicono.org`.
7. Audit-Logging in `email_send_audit` (siehe unten).

### Frontend-Umstellung

Statt `supabase.auth.resetPasswordForEmail(...)` und `supabase.auth.signUp({ email, password })` (für Signup-Confirmation-Mail) wird `supabase.functions.invoke("send-auth-email", { body: {...} })` aufgerufen:

- **`Auth.tsx`** (`handleForgotPassword`): Aufruf `send-auth-email` mit `type: "password_reset"`, `redirectTo: ${origin}/set-password`.
- **`ChangePasswordCard.tsx`**: gleicher Call.
- **`ChargingApp.tsx`** (Forgot + Signup): beide Calls auf neue Function umstellen.
- **`TenantEnergyApp.tsx`** (Forgot + Signup): identisch.
- **`useAuth.tsx`** (`signUp`): bleibt — Supabase erstellt den User; aber Confirmation-Mail unterdrücken (siehe Auth-Settings) und parallel `send-auth-email` mit `type: "signup_confirm"` aufrufen.

### Auth-Settings anpassen

Über `cloud--configure_auth`:
- `mailer_autoconfirm = false` (bleibt — User muss Mail bestätigen).
- Default-Mail-Templates in Supabase deaktivieren ist **nicht möglich** ohne Auth-Hook (Pro-Feature). Fallback: **Custom SMTP-Sender-Adresse** in Supabase auf `info@staging.aicono.org` setzen, damit auch unverhinderbare System-Mails (z. B. Email-Change-Confirmation, falls User über UI ändert) konsistent aussehen. Custom-Templates (HTML) ebenfalls in Supabase auf AICONO-Branding hinterlegen.

→ Konkret: Wir setzen die Auth-Email-Templates in Supabase via Management-API/Migration auf vereinfachte AICONO-Versionen mit `{{ .ConfirmationURL }}` als Fallback. Die primäre Versandstrecke bleibt aber `send-auth-email` über Resend.

### Audit-Tabelle

Neue Tabelle `email_send_audit` (RLS: nur super_admin lesen):
```
id uuid pk, created_at timestamptz, type text, recipient text,
status text ('sent'|'failed'|'suppressed_user_not_found'),
resend_message_id text, error text
```
Migration via `supabase--migration_lov`.

### Umzustellende/zu erstellende Dateien

**Neu:**
- `supabase/functions/send-auth-email/index.ts`
- `supabase/functions/_shared/email-templates.ts`
- Migration für `email_send_audit`

**Geändert:**
- `supabase/config.toml` (Registrierung `send-auth-email`)
- `src/pages/Auth.tsx`
- `src/pages/ChargingApp.tsx`
- `src/pages/TenantEnergyApp.tsx`
- `src/components/settings/ChangePasswordCard.tsx`
- `src/hooks/useAuth.tsx`
- Optional: i18n-Strings (DE/EN/ES/NL) für Toast-Fehlermeldungen

### Was sich für den User sichtbar ändert

- Passwort-Reset-Mail kommt von `info@staging.aicono.org` mit AICONO-Logo + Blau-Header (statt unbranded Supabase-Mail).
- Signup-Bestätigung in beiden PWAs ebenfalls gebrandet.
- Einheitliche Reply-To-Adresse für alle Mails.

### Out of Scope

- Migration zu Lovable Emails / DNS-Umzug (bewusst ausgeschlossen, Resend bleibt).
- Marketing-/Newsletter-Versand.
- Bounce-/Complaint-Handling über Resend-Webhooks (kann später separat ergänzt werden).

### Risiken & Hinweise

- `auth.admin.generateLink` setzt voraus, dass der User in `auth.users` bereits existiert (bei Signup wird er durch `signUp()` zuerst angelegt — Reihenfolge im Frontend beachten).
- Supabase sendet bei `signUp()` ggf. **automatisch** eine Confirmation-Mail. Um Doppelversand zu vermeiden: in den Auth-Settings die Default-Confirmation-Mail per Custom-Template auf einen minimalen "wird gleich zugestellt"-Hinweis reduzieren — oder den Template-Inhalt mit dem AICONO-Branding vereinheitlichen, dann ist es egal welcher Kanal greift. Empfehlung: **Beide Wege brand-konsistent halten** (Supabase-Template + send-auth-email) statt Doppelversand zu jagen.
- Rate-Limit gegen Mail-Bombing wichtig, da Endpoint ohne JWT erreichbar ist.

## Reihenfolge der Umsetzung

1. Migration `email_send_audit` anlegen.
2. `_shared/email-templates.ts` schreiben.
3. Edge Function `send-auth-email` schreiben + in `config.toml` registrieren + deployen.
4. Mit `curl` testen (Test-Recipient `christvs@t-online.de`).
5. Frontend-Aufrufe in 5 Dateien umstellen.
6. Supabase-Auth-Templates (über Management-API) auf AICONO-Branding setzen — als Sicherheitsnetz.
7. End-to-End-Test: Forgot-Password aus `/auth`, Signup aus Charging-PWA.
