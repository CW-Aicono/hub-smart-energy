# Roadmap nur im Staging und laufend gepflegt

## Was du bekommst
1. **Menü „Roadmap“ nur im Staging**
   Der Menüpunkt und die Seite erscheinen nur auf staging.aicono.org und in der Lovable-Vorschau. Auf dem Live-System (ems-pro / ems.aicono.org) gibt es den Menüpunkt nicht. Wer dort die Adresse direkt aufruft, landet auf der Portal-Übersicht.
   Das passt auch technisch: Live hat eine eigene Datenbank, die Roadmap-Einträge liegen nur in der Staging-Datenbank.

2. **Ich pflege das Board ab sofort selbst** (feste Arbeitsregel, wird gespeichert)
   - Neue Ideen von mir kommen als „Ideen“-Einträge ins Board, mit Kennzeichnung „Vorschlag AICONO-Assistent“.
   - Wenn du etwas beauftragst, lege ich es an oder verschiebe einen vorhandenen Eintrag nach „In Arbeit“. So entstehen keine Doppelungen.
   - Nach der Umsetzung setze ich den Eintrag auf „Erledigt“ und vermerke die Version.
   - Offene Punkte, die auf dich warten, bekommen den Status „Wartet auf Nutzer“ und den Grund dazu.

3. **Einmalige Bereinigung jetzt**
   Ich gleiche das Board mit dem bisherigen Verlauf ab. Das ist bereits Erledigtes:
   - AICONO Portal (v1.6.0)
   - Einheitspreise und Abo-Belege (v1.5.0)
   - Benutzer löschen
   - Zeitraum pro Grafik und Energieanalyse
   - Ladepunkt-Preis und Rabatte
   - Remote ohne Zeitlimit
   - sichtbare App-Version

   Das ist noch offen:
   - **Passwort Ladeserver**: gemeinsames Passwort zwischen Ladeserver und Cloud. Die alte Ladepunkt-Schnittstelle bleibt bis dahin gesperrt. Das wartet auf dich.
   - Abo-Beleg als PDF
   - Analytics Studio für ESB freischalten (deine Entscheidung)
   - Live-Deploy von v1.6.0 inklusive Lösch-Korrektur
   - AICONO Partner GmbH hat keinen Admin mehr
   - Impulszähler-Rollout
   - Hetzner-Deploy stabilisieren

   Doppelte oder überholte Karten fasse ich zusammen.

## Technische Details
- Neue Hilfsfunktion `isStagingEnvironment()` in `src/lib/` (gleiche Hostliste wie `ocppEnvironment.ts`).
- `SuperAdminSidebar`: Roadmap-Eintrag nur bei Staging. `/super-admin/roadmap`-Route: auf Live `Navigate` zur Portal-Übersicht.
- Status „Wartet auf Nutzer“: Spalte `status` ist Text. Ich ergänze den Wert `waiting` in `useRoadmapItems` (Typ, Spaltenlabel, 4 Sprachen) und füge eine Board-Spalte hinzu. Es ist keine Schemaänderung nötig.
- Herkunft „Vorschlag“: über das vorhandene Feld `owner` = „AICONO-Assistent“.
- Datenpflege per Datenbank-Einfügen/-Aktualisieren in `roadmap_items` (nur Staging). Die Historie schreibt der vorhandene Mechanismus.
- Arbeitsregel als Kern-Memory: Roadmap-Board und `roadmap.md` bei jedem Auftrag mitpflegen.
- Handbuch (4 Sprachen): Hinweis „Roadmap nur im Staging“. Dazu Changelog und Version 1.6.1.
