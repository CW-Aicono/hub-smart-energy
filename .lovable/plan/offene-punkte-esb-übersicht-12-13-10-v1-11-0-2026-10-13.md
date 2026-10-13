# Offene Punkte ESB (Übersicht 12./13.10.) – v1.11.0

## 1. Schnellere Live-Werte
- Ursache: Shelly-Werte werden nur minütlich serverseitig geholt; die Kacheln fragen zusätzlich nur alle 30 s bis 5 min nach.
- Neu: Kacheln mit Live-Leistung (Tacho, eigene Widgets im Modus „aktuell“, Netzanschluss) fragen bei sichtbarer Seite alle 10 s den Shelly-Live-Wert direkt ab (bestehende geprüfte Shelly-Abfrage mit Browser-Snapshot, 6-h-Namenscache, 429-Schutz). Ist die Seite verborgen, wird die Abfrage pausiert.
- Speicherung und 5-Min-Historie bleiben unverändert (minütlicher Lauf).

## 2. Meldung „Sensor nicht gefunden“
- Zähler 9c61fdf8… gibt es nur auf dem Live-System. Ich liefere zuerst lesende Prüfbefehle (Copy-Paste), um zu sehen, ob das Shelly-Gerät umbenannt/ersetzt wurde oder Shelly die Liste nur kurz unvollständig geliefert hat.
- Code-Verbesserung: Die Meldung entsteht erst, wenn der Sensor in 3 aufeinanderfolgenden Läufen fehlt, und löst sich automatisch, sobald er wieder auftaucht. Die Meldung nennt den Zählernamen statt nur der ID.

## 3. Energieanalyse in echter 15-Minuten-Auflösung
- Ursache: Der Server wählt die Auflösung selbst nach Zeitraum (über 14 Tage stündlich), die Auswahl im Menü wird überstimmt.
- Neu: Die gewählte Auflösung wird an den Server übergeben (zusätzlicher optionaler Parameter, alter Aufruf bleibt gültig). 15 Minuten als eigene Auswahl.
- Jahreslastgang-Export: Der CSV-Export holt die Daten unabhängig von der Diagrammanzeige seitenweise in 15-Min-Auflösung (35.040 Werte/Jahr), deutsches Zahlenformat, Semikolon, UTF-8-BOM.

## 4. Gestaltbares Dashboard
- Raster mit 12 Spalten statt Dritteln: Breiten 1/4, 1/3, 1/2, 2/3, 3/4, voll (bestehende Einstellungen werden übernommen, nichts verschiebt sich).
- Neue Kachel „Ladestation“: je Ladepunkt Ladeleistung (W/kW), Status (Verfügbar/Lädt/Fehler/Offline), Verbindung, Zählerstand, laufender Ladevorgang (Dauer, geladene kWh, ID-Tag), letzte Meldung. Mehrfach hinzufügbar, Ladepunkte pro Kachel wählbar.

## 5. Roadmap
- Neuer Eintrag „Inbetriebnahme- und Abnahme-Tool“ (Anlagen-, Abnahme-, Prüfprotokoll, Funktionsnachweis, Datenblätter) – nicht umgesetzt.

## Technische Details
- Migration (drizzle, idempotent): `get_power_series_auto(..., p_step_minutes int default null)` als neue Überladung; `dashboard_widgets` Größenwerte erweitert (Text, keine Typänderung); `shelly-periodic-sync` Zähler `missing_count` in integration_errors-Metadaten.
- Dateien: DashboardContent.tsx, useDashboardWidgets.tsx, DashboardCustomizer.tsx, neue ChargeStationWidget.tsx, CustomWidget.tsx, useEnergyAnalysisData.ts, powerSeries.ts, EnergyAnalysis.tsx, shelly-periodic-sync.
- Pflicht: CHANGELOG, Release Notes, Handbuch (4 Sprachen), Help-Versionshistorie, roadmap.md, Roadmap-Board.
- Live-System nach Deploy.
