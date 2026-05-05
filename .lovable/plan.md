## Ziel

E-Mail-Adressen müssen systemweit eindeutig einer Identität zugeordnet sein. Eine bestehende Mailadresse darf bei einer neuen Einladung **nicht stillschweigend** in einen anderen Tenant verschoben oder in der Rolle verändert werden. Insbesondere muss die strikte Trennung zwischen Super-Admin und Tenant-User gewahrt bleiben.

## Aktuelles Verhalten (Problem)

In `activate-invited-user` (Mode `directInvite`) und `invite-tenant-admin`:
- `auth.admin.createUser` wird direkt aufgerufen.
- Bei "already exists" wird der bestehende User aus `auth.users` herausgesucht und **kommentarlos** wiederverwendet:
  - `profiles.tenant_id` wird auf den neuen Tenant überschrieben.
  - `user_roles.role` wird überschrieben (DB-Trigger `guard_privileged_roles` schützt zwar Super-Admin-Downgrade, aber der Fehler wird im Code nicht abgefangen → 500-artige Fehler statt klarer Meldung).
  - Eine neue Einladungsmail wird verschickt.
- UI bekommt nur "Einladung gesendet" zu sehen – keine Warnung, dass ein bestehender Account verändert wurde.

## Geplante Änderungen

### 1. Neue Edge Function `check-email-availability` (read-only, schnell)

- Input: `{ email, intent: "tenant_invite" | "super_admin_invite", tenantId? }`
- Auth: nur authentifizierter Admin / Super-Admin darf aufrufen.
- Logik:
  1. Suche User in `auth.users` per `listUsers` (oder besser direkt in `profiles` per Mail-Lookup über `auth.users` Join via Service-Role).
  2. Wenn nicht vorhanden → `{ status: "available" }`.
  3. Wenn vorhanden → prüfe `profiles.tenant_id` und `user_roles.role`:
     - Bereits Super-Admin (`tenant_id IS NULL`, role `super_admin`): bei `tenant_invite` → `status: "blocked_super_admin"`.
     - Bereits in anderem Tenant: → `status: "blocked_other_tenant"` (mit Tenant-Name, nur für Super-Admin sichtbar; für Tenant-Admin generisch "andere Organisation").
     - Bereits im selben Tenant: → `status: "exists_same_tenant"` (mit aktueller Rolle).
     - Bei `super_admin_invite` und User ist Tenant-User: → `status: "blocked_tenant_user"`.
- Verwendung: vor dem Submit im UI (debounced bei E-Mail-Eingabe) **und** nochmal serverseitig in den Invite-Functions.

### 2. Härtung in `activate-invited-user` (Mode `directInvite`)

Vor `createUser` und nach Auflösung eines Konflikts:
- Wenn Mail bereits existiert:
  - Tenant-Admin (caller-Role `admin`):
    - Existiert User in anderem Tenant → **400** „E-Mail wird bereits in einer anderen Organisation verwendet."
    - Existiert User als Super-Admin → **400** „Diese E-Mail gehört zu einem Plattform-Konto und kann nicht eingeladen werden."
    - Existiert im selben Tenant → **409** mit klarer Meldung „Nutzer existiert bereits (Rolle: X). Bitte vorhandenen Nutzer bearbeiten."
  - Super-Admin (caller-Role `super_admin`):
    - Bei `super_admin`-Einladung & User ist Tenant-User → **400** „E-Mail ist bereits Tenant-Nutzer. Plattform-Rolle kann nicht vergeben werden."
    - Bei Tenant-Einladung & User existiert anderswo → standardmäßig blockieren, aber `force: true` Option erlaubt explizite Übernahme (mit Audit-Log-Eintrag).
- **Niemals** `profiles.tenant_id` ohne explizite Bestätigung überschreiben.
- **Niemals** `user_roles.role` ohne explizite Bestätigung überschreiben.

### 3. Härtung in `invite-tenant-admin`

Identische Logik wie oben (super_admin als caller, Ziel ist Tenant-Admin):
- Existiert User schon in anderem Tenant → blockieren ohne `force: true`.
- Existiert User als Super-Admin → blockieren mit klarer Fehlermeldung.

### 4. UI-Anpassungen

- **`InviteUserDialog.tsx`** (Tenant-Admin):
  - Bei E-Mail-Blur: Aufruf `check-email-availability`.
  - Inline-Hinweis unter dem Feld:
    - Grün „E-Mail verfügbar"
    - Rot mit konkreter Fehlermeldung wenn blockiert
    - Submit-Button disabled bei blockiertem Status
- **`SuperAdminInviteDialog.tsx`** (Super-Admin):
  - Identische Inline-Prüfung.
  - Bei `blocked_other_tenant`: zeigt Tenant-Name (Super-Admin darf das sehen).
  - Bei `exists_same_tenant`/`blocked_tenant_user`: Möglichkeit „Trotzdem übernehmen" mit Bestätigungsdialog (sendet `force: true` an Backend, erzeugt Audit-Eintrag).
- Toast-Fehler aus dem Backend werden 1:1 angezeigt (Backend ist Quelle der Wahrheit).

### 5. Audit-Log

Neuer Eintrag in `user_role_audit_log` (existiert bereits) bzw. neuer Tabelle `user_invitation_audit`:
- Wenn ein bestehender User per `force: true` übernommen wird, wird festgehalten:
  - Caller, alter Tenant, neuer Tenant, alte Rolle, neue Rolle, Zeitpunkt.

## Technische Details

- Edge Function `check-email-availability`:
  - `verify_jwt = false` mit manueller Token-Validierung (Standard-Pattern im Projekt).
  - Antwort enthält keine PII außer dem nötigen Tenant-Namen (nur an Super-Admin).
  - Rate-Limit empfohlen, aber zunächst nicht zwingend (Aufruf nur durch eingeloggten Admin).
- Bestehende `auth.users.email` UNIQUE-Constraint bleibt – wir verlassen uns explizit darauf.
- Keine DB-Migration nötig (existierende Tabellen reichen).

## Out of Scope

- Migration bestehender "verschobener" User (falls in Vergangenheit Konten unbeabsichtigt umgehängt wurden) – auf Anfrage separat.
- Self-Service Mailwechsel durch User selbst.

## Dateien, die geändert werden

- `supabase/functions/check-email-availability/index.ts` (neu)
- `supabase/functions/activate-invited-user/index.ts` (Härtung)
- `supabase/functions/invite-tenant-admin/index.ts` (Härtung)
- `supabase/config.toml` (verify_jwt-Eintrag für neue Function)
- `src/components/admin/InviteUserDialog.tsx` (Inline-Check + Disabled-Logik)
- `src/components/super-admin/SuperAdminInviteDialog.tsx` (Inline-Check + Force-Bestätigung)
- Optional: i18n-Strings in `src/i18n/tenantAppTranslations.ts` und `src/i18n/superAdminTranslations.ts`
