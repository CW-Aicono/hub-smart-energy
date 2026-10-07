# Einladungslink stabil machen (Punkt 5) + 2FA auf die Roadmap (Punkt 4)

## Ziel
Ein Einladungslink funktioniert zuverlässig auf Staging und Live. Er wird erst dann verbraucht, wenn das Passwort wirklich gespeichert wurde. Wer zu früh, doppelt oder in einem anderen Browser klickt, hat innerhalb der 7 Tage einen neuen Versuch.

## Was sich ändert
1. **Link wird erst nach dem Passwort-Speichern verbraucht.** Der Klick auf „Passwort festlegen“ prüft nur, ob der Link gültig ist. Erst nach dem Speichern auf der Passwortseite wird er gesperrt.
2. **Mehrfaches Klicken ist erlaubt.** Bis zum erfolgreichen Speichern kann der Link beliebig oft geöffnet werden. Jeder Klick erzeugt einen frischen Anmeldeschritt.
3. **Verständliche Fehlermeldungen.** Statt „Link ungültig“ steht dort, was los ist: „bereits verwendet, bitte anmelden oder Passwort vergessen“, „abgelaufen, bitte neue Einladung anfordern“ oder „unbekannt“. Dazu gibt es direkte Knöpfe für „Zur Anmeldung“ und „Passwort vergessen“.
4. **Richtige Adresse im Link.** Die Einladung nimmt immer die Adresse der Umgebung, aus der sie verschickt wurde (Staging oder Live), und nie eine Vorschauadresse.
5. **„Einladung erneut senden“ sichtbar machen.** In der Benutzerverwaltung (AICONO Portal und Kunden-Admin) bekommen noch nicht aktivierte Nutzer einen gut sichtbaren Knopf. Er verschickt einen neuen 7-Tage-Link, und der alte Link wird gesperrt.
6. **„Profil / Passwort ändern“ in jedem Bereich erreichbar.** Bisher steht der Punkt nur unten links im Kundenbereich. Er kommt auch ins AICONO Portal (alle Reiter) und ins Partner-Portal.

## Roadmap (nicht umsetzen)
- Punkt 4: Zwei-Faktor-Anmeldung (Authenticator-App), zunächst Pflicht für Portal-Admins und Partner-Admins.
- Erledigt-Eintrag für v1.6.9, sobald diese Änderung umgesetzt ist.

## Prüfung
- Mit einem Testnutzer auf Staging: Link zweimal öffnen, abbrechen, erneut öffnen und Passwort setzen. Danach muss der Link als „bereits verwendet“ angezeigt werden.
- „Erneut senden“ testen: Der alte Link muss gesperrt sein, der neue muss funktionieren.
- Das Profil muss im Portal und im Partner-Portal erreichbar sein.
- Build prüfen. Handbuch (4 Sprachen), Changelog, Release Notes und Version 1.6.9 werden aktualisiert.

## Technische Details
- `activate-invited-user`: Der Modus `getInviteLink` setzt `used_at` nicht mehr. Er prüft Ablauf und Verbrauch und erzeugt bei jedem Aufruf einen neuen Recovery-Link. Die Antwort enthält einen eindeutigen Fehlercode (`used` | `expired` | `not_found`).
- Neuer Modus `consumeInvite` (mit Auth): Er setzt `used_at` nur, wenn die E-Mail des Aufrufers zur Einladung passt. `SetPassword.tsx` ruft ihn nach erfolgreichem `updateUser` mit der Token-ID auf. Die Token-ID wird dafür beim Klick in `sessionStorage` gemerkt.
- `appOrigin`: Die Adresse kommt aus der Konfiguration bzw. aus `Origin`, wenn diese auf der Positivliste steht. `id-preview--*` und `*.lovable.app`-Vorschauadressen werden verworfen.
- Resend-Aktion in `UserManagement.tsx` / Portal-Benutzerliste für Nutzer ohne Login: Bestehende Tokens werden ungültig gemacht und ein neues Token wird erzeugt. Die Autorisierung bleibt serverseitig.
- Profil-Link in `SuperAdminSidebar` und `PartnerSidebar`.
- Keine Schemaänderung nötig (`used_at`/`expires_at` sind vorhanden).
