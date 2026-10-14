# Einladungslink „abgelaufen" beheben + Startpasswort vergeben (v1.11.1)

## Ursache (im Code bestätigt)
Es gibt drei Wege zum Einladen: neuen Kunden-Admin anlegen, Partner-Admin anlegen und Partner-User einladen. Bei allen drei landet ein **einmal nutzbarer Anmeldelink** direkt in der E-Mail. Der Knopf „Erneut senden" in der Kundenansicht des Portals macht das genauso.
- Firmen-Postfächer (z. B. Microsoft 365 / Defender) öffnen Links zur Prüfung automatisch. Dabei wird der Link verbraucht. Beim echten Klick heißt es dann „abgelaufen".
- Jedes erneute Senden macht außerdem den vorherigen Link ungültig.
- In der Mail steht „7 Tage gültig". Das stimmt für diese Links nicht.

Nur die normale Benutzer-Einladung nutzt schon den sicheren Weg: eine eigene Zwischenseite mit dem Knopf „Passwort festlegen". Die übrigen Einladungswege wurden bisher nicht darauf umgestellt.

Ob in diesen zwei Fällen wirklich der Mail-Scanner den Link verbraucht hat, prüfe ich vor dem Umbau mit einem lesenden Befehl auf dem Live-Server: Anmeldeprotokoll für beide E-Mail-Adressen. Den Befehl bekommst du im Chat zum Kopieren.

## Sofortlösung (heute, ohne Deploy)
Für Herrn Schmidt und Herrn Wigger bekommst du einen fertigen Befehl für das Live-Terminal. Er macht drei Dinge:
- Er setzt ein **Startpasswort**, das du selbst wählst. Im Befehl steht dafür ein Platzhalter.
- Er markiert das Konto mit „Passwort muss geändert werden".
- Er schließt die offene Einladung ab.

Du gibst das Startpasswort telefonisch weiter. Nach der Anmeldung leitet die App den Nutzer automatisch auf „Passwort festlegen" und lässt ihn erst danach weiter. Diese Sperre gibt es schon.

## Dauerhafte Lösung
1. **Alle Einladungen über die sichere Zwischenseite.** Kunden-Admin, Partner-Admin, Partner-User und „Erneut senden" bekommen den Link auf die eigene Seite „Einladung annehmen". Der eigentliche Anmeldelink entsteht erst beim Klick auf „Passwort festlegen". Mail-Scanner können ihn so nicht mehr verbrauchen, und er gilt wirklich 7 Tage.
2. **„Passwort vergessen" ebenso absichern.** Die Mail führt zuerst auf eine Zwischenseite mit dem Knopf „Neues Passwort festlegen". Es gilt dieselbe Ursache, also auch dieselbe Lösung.
3. **Neu: „Startpasswort vergeben".** In jeder Benutzerliste gibt es neben „Erneut senden" einen Schlüssel-Knopf. Das betrifft das AICONO Portal (Kunden-Detail, Partner, Portal-Rollen), den Kunden-Admin und das Partner-Portal (Mitglieder).
   - Ein Dialog fragt nach dem Startpasswort. Die Passwortregeln gelten: mindestens 8 Zeichen, Buchstabe und Ziffer, keine bekannten Datenleck-Passwörter. Ein Knopf „Zufällig erzeugen" ist dabei, ebenso „Kopieren".
   - Das Passwort wird nicht per E-Mail verschickt. Der Admin gibt es selbst weiter.
   - Bei der ersten Anmeldung muss der Nutzer das Passwort ändern.
   - Offene Einladungslinks werden dabei gesperrt, die Einladung gilt als angenommen.
4. **Wer darf das?**
   - Portal-Admin: alle Nutzer.
   - Kunden-Admin: nur Nutzer des eigenen Kunden.
   - Partner-Admin: eigene Partner-Mitglieder und Nutzer der eigenen Kunden.
   - Nie erlaubt: das eigene Konto, und niemand vergibt einem Portal-Admin ein Passwort, ohne selbst Portal-Admin zu sein.
   - Die Prüfung läuft auf dem Server. Jede Vergabe wird mit Bearbeiter und Zeitpunkt protokolliert.
5. **Doppelte Zeile aufräumen.** Ein Nutzer ist schon aktiv, steht aber zusätzlich als „Eingeladen" in der Liste, wie Meik Schmidt bei Becker-Antriebe. Diese Zeile wird ausgeblendet und die Einladung als angenommen markiert.

## Prüfung
- Auf Staging einen Kunden-Admin, einen Partner-Admin und einen Partner-User einladen. Den Link vorab „anklicken lassen", so wie es ein Scanner tut. Danach muss der echte Klick trotzdem funktionieren.
- Startpasswort vergeben, anmelden, Zwangswechsel prüfen. Danach darf nicht mehr weitergeleitet werden.
- Rechte prüfen: Ein Kunden-Admin darf bei fremden Nutzern kein Passwort setzen.
- Build und Tests prüfen. Handbuch (4 Sprachen), Changelog, Release Notes, Roadmap und Version 1.11.1 aktualisieren.

## Technische Details
- Neue gemeinsame Hilfsdatei `_shared/inviteLink.ts`: `createInviteToken(email, redirectTo)` legt eine Zeile in `invite_tokens` an (`expires_at` = 7 Tage) und gibt `${origin}/accept-invite?t=<id>` zurück. Die Adresse wird über `safeAuthRedirect` bestimmt. Die alten Fallbacks auf `hub-smart-energy.lovable.app` werden entfernt.
- Umstellung von `invite-tenant-admin`, `invite-partner-admin` und `partner-invite-member` auf `createInviteToken`. Kein `generateLink` mehr beim Versand. `getInviteLink` in `activate-invited-user` erzeugt den Recovery-Link erst beim Klick, wie heute schon.
- `send-auth-email` (`password_reset`): Statt `action_link` wird ein Token-Link auf `/accept-invite?t=…&mode=reset` verschickt. `AcceptInvite.tsx` zeigt je nach Modus „Neues Passwort festlegen" an. Bestätigungs- und Magic-Links bleiben unverändert.
- Neue Edge-Function `admin-set-temp-password`, mit JWT-Prüfung im Code. Die Rechte werden über `user_roles`, `is_tenant_member` bzw. `partner_members` (partner_admin) und `tenants.partner_id` geprüft. Dann folgt `auth.admin.updateUserById(id, { password, user_metadata: { must_change_password: true } })`. Offene `invite_tokens` werden auf `used_at` gesetzt und `user_invitations.accepted_at` wird gesetzt. Dazu kommt ein Eintrag in die bestehende Audit- bzw. Aktivitätstabelle; ob sie passt, prüfe ich vor dem Bau. Fehler „weak/pwned password" werden über `passwordErrorMessage` übersetzt.
- Frontend: neuer `SetTempPasswordDialog`, eingebunden in `SuperAdminTenantDetail.tsx`, `UserManagement.tsx`, `SuperAdminPartners.tsx`/Partner-Detail, `PartnerMembers.tsx` und `SuperAdminUsers.tsx`. `MustChangePasswordGuard` und `SetPassword.tsx` gibt es schon. `SetPassword` funktioniert auch mit normaler Sitzung. Dabei wird geprüft, dass ohne Recovery-Sitzung kein „aktuelles Passwort" nötig ist; falls doch, wird das Startpasswort als `current_password` mitgegeben.
- Liste: offene Einladungen gegen aktive Profile derselben E-Mail filtern (in `SuperAdminTenantDetail`). Die Bereinigung läuft über die bestehende `accept_own_invitations`-Logik bzw. eine idempotente Migration.
- Edge-Functions deployen: `invite-tenant-admin`, `invite-partner-admin`, `partner-invite-member`, `activate-invited-user`, `send-auth-email`, `admin-set-temp-password`. Keine Schemaänderung nötig. Falls doch eine nötig wird, kommt sie als idempotente Migration.
- Auswirkungen: Bereits verschickte alte Links bleiben kaputt. Die betroffenen Nutzer bekommen „Erneut senden" oder ein Startpasswort. Bestehende Logins sind nicht betroffen.
