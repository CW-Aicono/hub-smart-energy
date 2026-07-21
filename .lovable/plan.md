## Ziel

Verhindern, dass eine E-Mail-Adresse mehrfach im System angelegt wird (z. B. gleichzeitig als Partner-Mitglied und Tenant-User). Bestehende Login-Konflikte werden dadurch dauerhaft ausgeschlossen. Der Einzelfall `h.verst@esb-metelen.de` wird manuell bereinigt (nicht Teil dieses Plans).

## Umsetzung

### 1. Zentrale Prüf-Funktion (DB)

Neue Security-Definer-Funktion `public.email_exists_anywhere(_email text)` mit Suchpfad über:
- `auth.users` (existierender Account)
- `public.partner_members` (via Join auf `auth.users`)
- `public.user_invitations` (offene Tenant-Einladungen)
- ggf. `public.tenant_support_users`

Rückgabe: `{ exists: boolean, context: 'auth' | 'partner' | 'invitation' | null }`. Aufrufbar von `authenticated` und `service_role`.

### 2. Edge Functions absichern

In allen Anlage-/Einladungs-Funktionen wird vor dem Insert `email_exists_anywhere` geprüft. Bei Treffer wird ein sprechender Fehler zurückgegeben (`email_already_in_use` inkl. Kontext-Hinweis: „E-Mail ist bereits als Partner-Mitglied registriert" o. ä.):

- `invite-tenant-admin` (Tenant-Admin-Einladung)
- `invite-user` / User-Einladung im Tenant
- `partner-invite-member` (Partner-Mitglied einladen)
- `partner-create-tenant` (nur `contact_email`, falls diese später zum Login-User wird)
- Super-Admin User-Anlage (sofern via Edge Function)

### 3. Frontend-Feedback

Anpassung der Aufrufer-Dialoge (Partner-Mitglied hinzufügen, Tenant-User einladen, Super-Admin User anlegen), damit der neue Fehler als Toast mit Klartext angezeigt wird:

> „Diese E-Mail ist bereits im System registriert (als {Partner-Mitglied | Tenant-User | offene Einladung}). Bitte eine andere Adresse verwenden oder den bestehenden Account nutzen."

Der ursprüngliche Screenshot-Dialog (Super-Admin → Partner → Benutzer bearbeiten) wird zusätzlich so angepasst, dass beim **Ändern** der E-Mail dieselbe Prüfung greift.

### 4. Optionale Absicherung auf DB-Ebene

Zusätzlicher `BEFORE INSERT`-Trigger auf `partner_members` und `user_invitations`, der `email_exists_anywhere` ruft und bei Konflikt `RAISE EXCEPTION`. Damit werden auch direkte DB-Inserts (z. B. Migrationen, Support-Skripte) abgefangen.

### 5. Kein Auto-Merge, kein Login-Kontext-Switch

Bewusst ausgeschlossen (gemäß Entscheidung): keine Post-Login-Kontextauswahl, kein automatisches Zusammenführen bestehender Duplikate. Bestehende Duplikate bleiben funktionsfähig bis manuelle Bereinigung.

## Technische Details

- Migration: `public.email_exists_anywhere(text)` als `STABLE SECURITY DEFINER`, `search_path = public, auth`.
- Grants: `EXECUTE` an `authenticated`, `service_role`.
- Trigger-Funktionen ebenfalls `SECURITY DEFINER`; auf `TG_OP = 'INSERT'` und (für Update-Fall) `NEW.email IS DISTINCT FROM OLD.email`.
- Case-insensitive Vergleich (`lower(email)`).
- Edge-Function-Fehlerformat bleibt konsistent (`{ success: false, error, code: 'email_already_in_use', context }`).
- Keine Änderung an `auth.users` selbst (Supabase-managed).

## Nicht enthalten

- Manuelle Bereinigung des Einzelfalls `h.verst@esb-metelen.de` (erfolgt separat auf Wunsch).
- Migration bestehender Duplikate.
- UI zur Anzeige aller vorhandenen Duplikate.
