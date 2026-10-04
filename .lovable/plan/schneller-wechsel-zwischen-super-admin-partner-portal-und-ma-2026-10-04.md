# Schneller Wechsel zwischen Super-Admin, Partner-Portal und Mandant – bei gleich strengen Rechten

## Ziel
Wer mehrere Rollen hat (z. B. Hendrik Verst: Super-Admin + Partner-Admin + Administrator ESB GmbH), wechselt mit einem Klick zwischen den drei Bereichen. Niemand bekommt dadurch mehr Rechte als vorher.

## Grundsatz zur Sicherheit
- Der Umschalter ist **nur eine Navigationshilfe**. Er vergibt keine Rechte.
- Was jemand sehen und ändern darf, entscheidet weiterhin allein die Datenbank (Zugriffsregeln) und die Server-Funktionen – genau wie heute.
- Der Super-Admin-Bereich bleibt durch die bestehende Super-Admin-Prüfung geschützt; Partner-Portal durch die Partner-Mitgliedschaft; EMS durch die Mandanten-Zuordnung.
- Die gemerkte Auswahl im Browser bestimmt nur, **wohin** man nach dem Login springt – nie, **was** man darf. Wird sie manipuliert, landet man höchstens auf einer Seite, die einen abweist.
- Der Super-Admin sieht im EMS nur den eigenen Mandanten (ESB), nicht andere Kunden. Andere Kunden weiterhin ausschließlich über die protokollierte Remote-Sitzung.

## Was sich ändert

1. **Startseite nach dem Login**
   - Hat jemand nur eine Rolle: keine Änderung.
   - Hat jemand mehrere Bereiche: es gilt die zuletzt gewählte Bereichswahl; beim ersten Mal erscheint die Auswahl (jetzt mit bis zu drei Kacheln).
   - Super-Admins **ohne** eigenen Mandanten landen wie bisher direkt im Super-Admin.

2. **Umschalter mit drei Stufen**
   - „Super-Admin" / „Kaufmännisch" / „Technisch" – es werden nur die Bereiche angezeigt, die die Person tatsächlich nutzen darf (mindestens zwei, sonst kein Umschalter).
   - Gut sichtbare Kapsel wie zuletzt angepasst.

3. **Umschalter überall**
   - Im EMS (wie bisher), im Partner-Portal (wie bisher) und **neu oben in der Super-Admin-Seitenleiste**, damit man dort nicht mehr „gefangen" ist.

4. **Remote-Sitzung unverändert**
   - Während einer Remote-Sitzung in einen fremden Mandanten wird der Umschalter ausgeblendet; zurück geht es nur über „Remote beenden".

## Prüfung nach dem Bau
- Typprüfung/Build.
- Durchklicken mit Konten unterschiedlicher Rollen: nur Tenant, nur Partner, nur Super-Admin, alle drei.
- Gegenprobe: Ein Nutzer ohne Super-Admin-Rolle, der die Bereichswahl im Browser auf „Super-Admin" setzt, wird abgewiesen.
- Einträge in Änderungsprotokoll und Release Notes.

## Hinweise (unabhängig von diesem Schritt)
- Auf Live muss weiterhin der Datenbank-Befehl für die Modul-Freigaberegeln laufen bzw. „Weg B" (Workflow-Datei auf main) erledigt werden, sonst schlägt das Speichern der Partner-Module fehl.
- Auf Staging hat Hendrik Verst keine Super-Admin-Rolle; dort erscheint die Super-Admin-Stufe für ihn bewusst nicht.

## Technische Details
- `src/lib/areaPreference.ts`: Typ `AppArea` um `"super_admin"` erweitern; ungültige Werte → `null`.
- `src/hooks/useAreaAccess.tsx`: zusätzlich `useSuperAdmin()`; liefert `availableAreas: AppArea[]`, `canSwitch = availableAreas.length >= 2`. Während `isImpersonating()` → `canSwitch = false`.
- `src/components/common/AreaSwitcher.tsx`: `current` erweitert auf drei Werte, rendert nur `availableAreas`; Ziel `/super-admin`, `/partner`, `/`.
- `src/components/common/AreaChooser.tsx`: dritte Kachel „Super-Admin", nur wenn berechtigt.
- `src/pages/Index.tsx`: harte Weiterleitung `isSuperAdmin → /super-admin` nur noch, wenn kein Tenant und keine Partner-Mitgliedschaft; sonst Präferenz auswerten (Präferenz `super_admin` nur befolgen, wenn `isSuperAdmin` true – serverseitig geprüft über `user_roles`). Partner-Zweig `!isSuperAdmin`-Bedingung entfernen und in die gemeinsame Logik überführen.
- `src/components/super-admin/SuperAdminSidebar.tsx`: `<AreaSwitcher current="super_admin" />` oben einbinden.
- `SuperAdminWrapper` bleibt unverändert als Zugriffsschutz; keine Änderungen an Datenbank-Regeln, Rollen-Tabellen oder Server-Funktionen.
