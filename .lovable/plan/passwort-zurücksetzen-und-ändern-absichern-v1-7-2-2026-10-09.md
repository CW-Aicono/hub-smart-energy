# Passwort zurücksetzen und ändern absichern (v1.7.2)

## Ziel
Passwort-Links zeigen immer auf die richtige Adresse (Staging oder Live). Im Profil lässt sich das Passwort direkt ändern. Bekannte, gestohlene Passwörter werden abgelehnt.

## Was sich ändert
1. **Richtige Adresse im Link.** E-Mails für „Passwort vergessen“ und „Passwort ändern“ verlinken nur noch auf staging.aicono.org oder ems-pro.aicono.org. Vorschau- und fremde Adressen werden ersetzt. So wird es auch bei den Einladungen schon gemacht.
2. **Direkt im Profil ändern.** Unter „Profil & Passwort“ gibt es ein neues Formular mit diesen Feldern: aktuelles Passwort, neues Passwort und Bestätigung. Das neue Passwort braucht mindestens 8 Zeichen. Es muss Buchstaben und Ziffern enthalten und darf nicht gleich dem alten sein. Wer das alte Passwort vergessen hat, nutzt weiter den Weg per E-Mail-Link.
3. **Schutz vor bekannten Passwörtern.** Passwörter, die schon in bekannten Datenlecks aufgetaucht sind, werden abgelehnt. Die Fehlermeldung ist auf Deutsch und verständlich. Das gilt beim Festlegen, Zurücksetzen und Ändern.
4. **Einheitliche Regeln.** Die Seite „Passwort festlegen“ nutzt dieselben Mindestanforderungen und dieselben Meldungen wie das Profil.

Die Begrenzung auf 5 Anfragen pro Minute bleibt bewusst unverändert. Sie schützt vor Missbrauch.

## Prüfung
- Kleiner Test für die Adressregel: Vorschau- und fremde Adressen werden auf die erlaubte Adresse umgebogen.
- Kleiner Test für die Passwortregeln: Mindestlänge, Ziffer und Buchstabe, alt ungleich neu.
- Build prüfen. Danach Handbuch (4 Sprachen), Changelog, Release Notes, Roadmap und Version 1.7.2 pflegen.

## Technische Details
- `send-auth-email`: `redirectTo` wird serverseitig gegen eine Positivliste geprüft. Das sind `https://staging.aicono.org` und `https://ems-pro.aicono.org`, jeweils mit dem Pfad `/set-password` oder `/mein-sharing/set-password`. Ist die Adresse nicht erlaubt, wird `APP_ORIGIN` aus der Umgebung genommen, sonst der Origin-Header, falls er auf der Liste steht, sonst die Live-Domain. Die Funktion wird neu deployt.
- Neue gemeinsame Hilfsdatei `_shared/appOrigin.ts`. Sie wird auch von `activate-invited-user` genutzt, damit die Regel nicht doppelt gepflegt wird.
- `ChangePasswordCard`: Das aktuelle Passwort wird über `signInWithPassword` mit der eigenen E-Mail geprüft, danach folgt `updateUser({ password })`. Der E-Mail-Weg bleibt als zweite Option.
- `src/lib/passwordPolicy.ts` enthält die gemeinsamen Regeln und die Übersetzung der Fehlercodes `weak_password` / `same_password`.
- Auth-Konfiguration: `password_hibp_enabled = true`. Alle anderen Einstellungen bleiben unverändert (keine Selbstregistrierung oder Auto-Bestätigung ändern).
- Keine Schemaänderung.
