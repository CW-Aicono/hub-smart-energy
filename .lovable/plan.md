# Gebäudekomplex verständlich machen und Kosten je Abteilung (Raum) verteilen

## Ausgangslage
- Der Aufbau „Gebäudekomplex → Gebäude → Ebene → Raum“ ist schon möglich. Ein Gebäude wird aber nur über ein verstecktes Auswahlfeld beim Anlegen einem Komplex zugeordnet.
- Abteilungen sind künftig die Räume, hier ist keine neue Stufe nötig.
- Zähler lassen sich schon heute einem Raum zuordnen. Eine Auswertung von Verbrauch und Kosten je Raum gibt es aber noch nicht.

## 1. Gebäudekomplex einfacher bedienen
- Beim Komplex gibt es den Knopf „Gebäude hinzufügen“. Der Komplex ist dabei schon vorausgewählt.
- Bestehende Gebäude lassen sich nachträglich einem Komplex zuordnen oder wieder lösen.
- Die Standortliste zeigt den Komplex aufklappbar mit Gebäuden, Ebenen und Räumen.
- Räume heißen in der Oberfläche „Raum / Abteilung“.

## 2. Kostenverteilung je Abteilung
Neuer Reiter „Kostenverteilung“ beim Standort und beim Komplex, mit Zeitraum (Monat, Quartal, Jahr) und Energieart.

- **Eigener Zähler:** Hat ein Raum eigene Zähler, zählt deren Verbrauch direkt.
- **Restverbrauch:** Der Restverbrauch ist der Hauptzähler des Gebäudes minus alle direkt erfassten Räume. Er wird nach einem einstellbaren Schlüssel auf die Räume verteilt:
  - nach Fläche (m², kommt aus dem Grundriss oder wird von Hand eingetragen),
  - zu gleichen Teilen,
  - oder ohne Verteilung, dann bleibt er als „Allgemein“ stehen.
- **Kosten:** Sie werden mit den hinterlegten Energiepreisen des Standorts berechnet.
- **Summen:** Die Ergebnisse werden je Raum, je Ebene, je Gebäude und für den ganzen Komplex zusammengezählt.
- **Export:** Als CSV und PDF, im deutschen Zahlenformat.

## Nicht enthalten
- Keine Rechnungen an Abteilungen. Die Auswertung ist eine Übersicht und ein Export.
- Bestehende Zähler, Preise und Berichte bleiben unverändert.

## Technische Details
- Neue Datenbankänderung (nur hinzufügend, wiederholbar):
  - Neue Felder bei den Räumen: `area_m2` (wahlweise) und `cost_center` (Kostenstelle, wahlweise).
  - Neue Einstellung je Standort: `allocation_key` (area, equal oder none).
  - Neue Server-Funktion `get_room_cost_allocation(location_ids, start, end, energy_type)` mit derselben Mandantenprüfung wie die bestehenden Verbrauchsfunktionen. Sie nutzt die Tagessummen und `meters.room_id/floor_id` sowie den Hauptzähler über `get_location_main_meter`.
- Ein Fehlbetrag (Hauptzähler kleiner als die Summe der Raumzähler) wird nicht verteilt, sondern als Hinweis angezeigt.
- Tests für die Verteilregeln: Fläche, gleiche Teile, ohne Verteilung, Fehlbetrag.
- Handbuch (4 Sprachen), Changelog, Versionshinweise, Version 1.13.0 und Roadmap werden aktualisiert.
