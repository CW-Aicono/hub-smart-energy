# Drei Live-Probleme: Partner-Module, Nutzer entfernen, ESB-Zugang

## 1. Partner-Module lassen sich im Super-Admin nicht anhaken
Beobachtung: Kein Fehler, der Schalter bleibt aber aus. Auf Staging gibt es keinen einzigen Aufruf der neuen Speicherfunktion. Die Ursache auf Live ist also noch nicht bestätigt.

Vorgehen:
- Zuerst prüfen, ob die Speicherfunktion auf dem Hetzner-Server überhaupt vorhanden ist und antwortet. Danach prüfen, ob der Live-Build schon den neuen Dialog enthält.
- Dialog robuster machen:
  - Der Schalter springt sofort um und springt bei einem Fehler zurück.
  - Jeder Fehler und jedes Ausbleiben einer Antwort (Zeitlimit 15 s) erscheint als deutliche Meldung, nie mehr stumm.
  - Nach dem Speichern wird die Liste neu geladen und mit dem Server abgeglichen.
- Falls die Funktion auf Hetzner fehlt: Sie wird in die Deploy-Liste aufgenommen, damit sie mit dem nächsten Deploy automatisch mitkommt.

## 2. h.verst im Mandanten löschen schlägt fehl
Ursache: „Löschen“ in der Benutzerliste eines Mandanten löscht heute das komplette Konto. Bei h.verst würde das auch seinen Super-Admin- und Partner-Zugang zerstören. Die Schutzregeln (letzter Super-Admin, Selbstlöschung) brechen deshalb zu Recht ab. Die Meldung erklärt das aber nicht.

Lösung nach dem vereinbarten Mehrrollen-Modell:
- In der Benutzerverwaltung eines Mandanten heißt die Aktion „Aus Mandant entfernen“. Sie entfernt nur die Mitgliedschaft und die Mandantenrollen, das Konto bleibt bestehen.
- Konto komplett löschen gibt es weiterhin nur unter Super-Admin → Benutzer, mit den bestehenden Schutzregeln.
- Hat die Person weitere Rollen (Partner oder Super-Admin), weist der Dialog darauf hin, dass diese erhalten bleiben.
- Die Fehlermeldungen werden auf Deutsch und verständlich angezeigt statt „non-2xx“.

## 3. Über Partner ESB kommt h.verst nicht in den Tenant ESB
Ursache: „EMS öffnen“ startet immer eine Remote-Sitzung. Beim eigenen Mandanten ist das unnötig und scheitert, sobald die Remote-Freigabe von ESB aus ist. Bei Bolan und Jüke klappt es, weil dort Remote erlaubt ist.

Lösung:
- Ist man selbst Mitglied des Mandanten, öffnet „EMS öffnen“ ihn direkt (wie der Umschalter „Technisch“). Es gibt dann keine Remote-Sitzung und keine Freigabe ist nötig.
- Bei fremden Mandanten bleibt es bei Remote mit Kundenfreigabe. Ist die Freigabe aus, erscheint die Meldung „Kunde hat Remote-Support nicht freigegeben“ statt „non-2xx“.

## Auswirkungsprüfung
- Rechte bleiben unverändert: Direktzugang nur bei echter Mitgliedschaft (serverseitig per Mandanten-Zuordnung geprüft). Remote-Freigabe für fremde Mandanten bleibt Pflicht.
- „Aus Mandant entfernen“ darf nur ein Admin desselben Mandanten, ein zuständiger Partner-Admin oder ein Super-Admin ausführen. Niemand darf sich selbst entfernen, und der letzte Admin eines Mandanten bleibt geschützt (bestehende Regel).
- Nach dem Build: Typprüfung, dann jeden der drei Abläufe in der Vorschau durchklicken.

## Dokumentation
Version 1.4.2, Versionsverlauf, Änderungsprotokoll, Versionshinweise und Handbuch (4 Sprachen) zu „Aus Mandant entfernen“ und „EMS öffnen“.

## Technische Details
- `PartnerModulesDialog.tsx`: optimistisches Update, Timeout, Rollback, Refetch.
- Prüfen, ob `super-admin-set-partner-module` im Hetzner-Functions-Deploy enthalten ist (`scripts/deploy.sh` und Workflow), sonst ergänzen.
- Neue Edge Function `remove-user-from-tenant`: Prüft Aufrufer (Tenant-Admin desselben Tenants, Partner-Admin des Tenant-Partners oder Super-Admin). Setzt `profiles.tenant_id = null` und entfernt `admin`/`user` aus `user_roles`. `super_admin` und `partner_members` bleiben unangetastet. Schreibt einen Audit-Log-Eintrag.
- Tenant-Benutzerliste ruft die neue Function statt `delete-user` auf. `delete-user` bleibt nur im Super-Admin.
- Partner-Tenant-Liste: Ist `tenant.id === eigener profiles.tenant_id`, Bereich auf EMS setzen und `/` öffnen, sonst Impersonation. 403 von `support-session-impersonate` wird verständlich übersetzt.
