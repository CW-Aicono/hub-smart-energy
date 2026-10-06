# Remote-Freigabe erzwingen und Einladungen automatisch abschließen

## 1. Remote ist aus, Zugriff trotzdem möglich
**Ursache (im Code bestätigt):** Die Funktion, die den Support-Zugang startet, prüft nur, ob der Aufrufer Super-Admin oder zuständiger Partner-Admin ist. Den Schalter „Remote-Zugriff erlauben“ des Kunden (`tenants.remote_support_enabled`) liest sie nie.

**Lösung:**
- Beim Start einer Remote-Sitzung wird geprüft, ob der Kunde den Zugriff erlaubt hat. Wenn nicht: Abweisung mit klarer Meldung „Kunde hat Remote-Zugriff nicht freigegeben“.
- Schaltet der Kunde den Zugriff aus, werden laufende Sitzungen sofort beendet (Sitzung geschlossen, Support-Anmeldung abgemeldet). Der Support landet wieder in seinem eigenen Bereich.
- Wenn der Remote-Knopf im Super-Admin/Partner-Portal sichtbar ist, wird er bei fehlender Freigabe ausgegraut mit Hinweis.
- Zusätzlich: Hinweis „Änderungsprotokoll noch nicht eingerichtet“ im Verlauf prüfen. Er erscheint, weil auf Live die nötige Datenbank-Ergänzung fehlt; sie kommt mit dem nächsten Deploy.

## 2. Kunde ist angemeldet, Einladung steht noch auf „offen“
**Ursache (im Code bestätigt):** Einladungen werden nur bei einem älteren Ablauf als angenommen markiert. Beim aktuellen Ablauf (Link → Passwort festlegen) bleibt der Eintrag offen.

**Lösung:**
- Nach dem ersten erfolgreichen Passwort-Setzen/Anmelden wird die passende offene Einladung (gleiche E-Mail + Kunde) als angenommen markiert.
- Einmalige Bereinigung: alle offenen Einladungen, deren Person schon ein angemeldetes Konto beim selben Kunden hat, werden als angenommen markiert (z. B. info@lohausenergy.de).
- Die Benutzerliste blendet zur Sicherheit Einladungen aus, deren Person bereits aktiv im Kunden ist.

## Technische Details
- `support-session-impersonate`: `remote_support_enabled` laden, falls false → 403. Auch Super-Admins sind gebunden (Kundenzustimmung).
- Datenbank-Trigger auf `tenants`: bei `remote_support_enabled` true→false offene `support_sessions` schließen und Sessions des Support-Users widerrufen (security definer, idempotente Migration).
- Datenbank-Trigger/Funktion: setzt `user_invitations.accepted_at`, sobald `auth.users.last_sign_in_at` erstmals gesetzt wird, alternativ Aufruf in SetPassword über eine abgesicherte Funktion (nur eigene E-Mail). Plus Backfill in der Migration.
- `UserManagement.tsx` / `SuperAdminTenantDetail.tsx`: offene Einladungen gegen aktive Profile filtern.
- Auswirkungen: Laufender Support bricht ab, wenn der Kunde ausschaltet (gewollt). Ladepunkte nicht betroffen.
- Changelog, Release Notes, Handbuch (4 Sprachen), Version v1.2.2.
- Prüfung: Remote bei ausgeschaltetem Schalter muss abgewiesen werden; Einladung von Lohaus muss verschwinden.
