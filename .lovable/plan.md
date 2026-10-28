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
- Die eigenständige Karte „Etagen & Grundrisse" wird beim Komplex ausgeblendet; nur wenn der Komplex selbst Etagen hat (Altbestand), erscheinen diese als eigener Unterpunkt „Etagen direkt am Komplex", damit nichts verloren geht.
- Normale Gebäude (kein Komplex) bleiben unverändert.
- Gleiches Modul-Recht wie bisher („Grundrisse"-Modul); ohne Modul nur Gebäudeliste.

## Technisch
- `ComplexBuildingsCard.tsx`: je Kind-Gebäude ein `Collapsible`; Inhalt lädt Etagen per vorhandenem Floors-Hook für `c.id` (tenant-gefiltert) und rendert `FloorList` + `AddFloorDialog`.
- `LocationDetail.tsx`: `FloorsCollapsible` bei `type === "gebaeudekomplex"` nur rendern, wenn `floors.length > 0`, mit angepasstem Titel.
- Keine Datenbankänderung; Rechte/RLS unverändert.
- Übersetzungen (4 Sprachen), Handbuch, Changelog, Release Notes, Version 1.13.2, Roadmap.
- Prüfung: Build + Browser-Check an einem Komplex mit Gebäuden.
