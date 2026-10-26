# Offene Punkte aus dem Live-System (Übersicht 23.10.2026) – Einordnung und Vorgehen

## Kurzfazit
Von den 7 Punkten sind 2 echte Fehler mit hoher Priorität (Rechte der Rolle „Endkunde“ greifen nicht, Energieanalyse leer). 2 Punkte sind sinnvolle Verbesserungen, die zur Struktur passen (Aktualisierungsintervall, E-Mail-Adresse ändern). Das Inbetriebnahme-/Abnahmeprotokoll steht bereits als Roadmap-Idee und ist ein eigenes Modul.

## Priorität A – echte Fehler, sofort beheben

### A1. Eigene Rollen („Endkunde“) werden nicht durchgesetzt (Seiten 3, 6–10)
Befund im Code: Die unter „Rollen & Rechte“ vergebenen Rechte werden gespeichert und in der Rollenverwaltung angezeigt. Menü, Seiten und Schaltflächen fragen sie aber nirgends ab. Deshalb sieht der Endkunde „Energiedaten“, „Standorte“ und alle Ladeinfrastruktur-Seiten und kann das Dashboard anpassen. Die Rechte steuern derzeit also nur die Anzeige in der Verwaltung, nicht den Zugriff.
Passt zur Struktur: ja. Module (was der Kunde gebucht hat) bleiben die obere Grenze, Rechte schränken innerhalb davon pro Nutzer ein.
Vorgehen:
1. Gemeinsame Rechteprüfung für den angemeldeten Nutzer (Kunden-Admin hat immer alles, Nutzer mit eigener Rolle nur die vergebenen Rechte).
2. Menü: Einträge und Unterpunkte nur bei passendem „anzeigen“-Recht (z. B. Ladeinfrastruktur → nur „Abrechnung“).
3. Seitenschutz: direkter Aufruf per Adresse führt ohne Recht auf eine Hinweisseite.
4. Aktionen: „Dashboard anpassen“, Bearbeiten/Löschen/Anlegen nur mit Recht.
5. Serverseitig: Schreibzugriffe für die wichtigsten Bereiche (Dashboard-Layout, Ladepunkte, Zähler, Standorte) zusätzlich in der Datenbank absichern – UI-Prüfung allein ist keine Sicherheit.
6. Tests je Regel (z. B. „Endkunde mit nur Dashboard anzeigen darf nicht anpassen“).

### A2. Energieanalyse zeigt keine Werte (Seite 2)
Ursache noch nicht bestätigt. Erster Schritt: auf Live prüfen, ob die neue Auswertungsfunktion für feste Auflösungen (15 Minuten, aus v1.11.0) vorhanden ist und Werte für die beiden Hausanschluss-Zähler liefert. Ich liefere dafür lesende Prüfbefehle als Copy-Paste-Code. Danach gezielter Fix plus Fehlermeldung statt leerem Diagramm, wenn die Abfrage scheitert.

### A3. „Keine Standorte vorhanden“ beim Endkunden (Seite 8)
Wahrscheinlich hat der Testnutzer keine Standortfreigabe. Klären mit A1: Entweder Menüpunkt ausblenden (kein Recht) oder Hinweis „Ihnen sind keine Standorte freigegeben“ statt „Keine Standorte vorhanden“. Live-Prüfung der Standortfreigaben vorab.

## Priorität B – Verbesserungen, passen zur Struktur

### B1. Dashboard aktualisiert langsamer als die Shelly Cloud (Seite 1)
Die Dashboard-Kacheln laden teils nur alle 5 Minuten neu (eigene Widgets, PV-Prognose); Energiefluss 30–60 s. Vorschlag: Leistungs-/Livekacheln alle 10–15 s aus den Livewerten (wie seit v1.11.0 beim Livewert-Abruf), Verlaufsdiagramme weiter 5 Minuten. Nur sichtbare Kacheln und nur bei aktivem Browser-Tab aktualisieren, damit die Datenbank nicht stärker belastet wird (IO-Budget).

### B2. E-Mail-Adresse nachträglich ändern (Seite 5)
Passt zur Struktur. Zwei Wege:
- Nutzer selbst im Profil: neue Adresse, Bestätigung per Mail an die neue Adresse.
- Kunden-/Partner-/Portal-Admin in der Benutzerverwaltung: serverseitig geprüfte Änderung (nur Nutzer des eigenen Bereichs), Info-Mail an alte und neue Adresse, Eintrag im Protokoll.

## Priorität C – eigenes Modul

### C1. Anlagenprotokoll (Inbetriebnahme) und Abnahmeprotokoll (Seite 4)
Bereits als Roadmap-Idee erfasst. Vorschlag: Checklisten-Vorlagen je Anlagentyp (Ladepunkt, Zähler, Speicher), Messwerte automatisch übernehmen, Fotos, Unterschrift, PDF in der Dokumentation des Standorts. Dafür brauche ich die erwähnte Mail bzw. Musterprotokolle; Umsetzung als eigener Plan.

## Reihenfolge
```text
1. A2 Live-Prüfbefehle (lesend)  -> Ursache bestätigen
2. A1 Rechte durchsetzen (+A3)    -> v1.12.1 / v1.13.0
3. A2 Fix
4. B1 Aktualisierung, B2 E-Mail ändern
5. C1 eigener Plan nach Musterprotokollen
```
Je Schritt: Changelog, Release Notes, Handbuch (4 Sprachen), Version, Roadmap; Datenbankänderungen als idempotente Migrationen.

## Technische Details
- Rechte: `useCustomRoles` liefert Rollen/Rechte, wird aber nur in Rollen- und Benutzerverwaltung genutzt; neuer Hook `useMyPermissions` + `<RequirePermission>`-Wrapper für Routen, Sidebar-Filter, Buttons (`DashboardCustomizer`).
- RLS: Hilfsfunktion `has_permission(user, code)` (SECURITY DEFINER), in Schreib-Policies der Kernbereiche ergänzt; Kunden-Admin/Partner/Portal unverändert.
- Refresh: `refetchInterval` in `CustomWidget` (5 min) und Leistungskacheln anpassen, `refetchIntervalInBackground: false`.
- E-Mail: Edge Function mit Bereichsprüfung, Audit-Eintrag.
