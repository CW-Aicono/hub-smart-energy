# Etagen & Grundrisse verschachtelt unter „Gebäude im Komplex" (v1.13.2)

## Ziel
Beim Gebäudekomplex stehen Etagen nicht mehr als separate Karte darunter, sondern direkt bei jedem Gebäude als aufklappbarer Unterpunkt.

```text
Gebäude im Komplex                      [+ Gebäude hinzufügen]
 > Gebäude A   (3 Etagen)      [+ Etage] [Öffnen] [Lösen]
     - EG   (Grundriss, Räume / Abteilungen)
     - OG 1
 > Gebäude B   (2 Etagen)
Etagen des Komplexes selbst (nur falls vorhanden, z. B. Außenanlage)
```

## Verhalten
- Jedes Gebäude in der Liste ist aufklappbar und zeigt seine Etagen mit derselben Etagenliste wie auf der Gebäudeseite (Grundriss hochladen, Räume, 3D usw.).
- Knopf „Etage hinzufügen" direkt in der Gebäudezeile (nur Admins, wie bisher).
- Anzahl der Etagen als kleine Angabe neben dem Gebäudenamen.
- Die eigenständige Karte „Etagen & Grundrisse" wird beim Komplex ausgeblendet; hat der Komplex selbst Etagen (Altbestand), werden diese per Migration automatisch in ein neues Platzhalter-Gebäude „Gebäude 1 (bitte umbenennen)" im Komplex verschoben – samt Grundrissen, Räumen und Zählerzuordnungen. Der Name lässt sich danach wie bei jedem Gebäude ändern; nichts geht verloren. Neue Komplexe erhalten beim Anlegen ebenfalls ein umbenennbares Platzhalter-Gebäude.
- Flexibel umbauen (auch zum Korrigieren von Fehlern), jeweils mit Bestätigungsdialog und Vorschau, was mitwandert:
  - „Etage in Gebäude umwandeln": Eine als Gebäude „missbrauchte" Ebene wird zu einem eigenen Gebäude im Komplex; ihre Räume / Abteilungen werden zu einer Etage „EG" darin, Grundriss und Zählerzuordnungen bleiben erhalten.
  - „Etage verschieben": Etage samt Grundriss, Räumen und Zählern in ein anderes Gebäude desselben Komplexes verschieben.
  - „Gebäude in Etage umwandeln" (Gegenrichtung): Gebäude ohne eigene Unterstruktur wird zur Etage eines anderen Gebäudes; nur möglich, wenn dabei keine Daten verloren gehen, sonst Hinweis.
  - Alles nur für Admins, nur innerhalb desselben Mandanten; Umbau läuft serverseitig in einem Schritt (ganz oder gar nicht), Messwerte und Historie bleiben unverändert.
- Normale Gebäude (kein Komplex) bleiben unverändert.
- Gleiches Modul-Recht wie bisher („Grundrisse"-Modul); ohne Modul nur Gebäudeliste.

## Technisch
- `ComplexBuildingsCard.tsx`: je Kind-Gebäude ein `Collapsible`; Inhalt lädt Etagen per vorhandenem Floors-Hook für `c.id` (tenant-gefiltert) und rendert `FloorList` + `AddFloorDialog`.
- `LocationDetail.tsx`: `FloorsCollapsible` bei `type === "gebaeudekomplex"` nur rendern, wenn `floors.length > 0`, mit angepasstem Titel.
- Keine Datenbankänderung; Rechte/RLS unverändert.
- Übersetzungen (4 Sprachen), Handbuch, Changelog, Release Notes, Version 1.13.2, Roadmap.
- Prüfung: Build + Browser-Check an einem Komplex mit Gebäuden.
