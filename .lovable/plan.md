# Bolan: Messwerte nur bei offenem Laptop, Sync-Fehler, Tacho-Wert falsch

## 1. „Werte kommen nur, wenn mein Laptop an ist“ – ja, das kann sein
Die Diagramme zeigen nur Werte von ca. 08:00–08:15 (dein Login-Zeitraum). Die Messwert-Speicherung läuft auch dann, wenn ein Browser die Live-Werte abfragt. Läuft die automatische Abholung auf dem Server nicht oder nicht für Bolan, entstehen nur Werte, solange jemand das Dashboard offen hat.

Vorgehen:
- Zuerst prüfe ich das auf Live nur lesend (Prüfbefehl im Chat): Wann lief die Abholung zuletzt, wie viele Werte pro Stunde wurden heute Nacht für beide Bolan-Zähler gespeichert und ob die Abholung im Sammel-Zeitplan wirklich aufgerufen wird.
- Danach behebe ich die Ursache, die sich zeigt (z. B. Abholung fehlt im Zeitplan, schlägt still fehl oder überspringt die Bolan-Integrationen). Ziel: Werte rund um die Uhr, auch wenn kein Browser offen ist.
- Die Live-Abfrage im Browser speichert danach selbst keine Werte mehr. So hängen die Daten nicht mehr davon ab, ob gerade jemand angemeldet ist.

## 2. „Sync-Fehler: Shelly“ beim Kunden, bei dir „Online“
Der Hinweis stammt aus einem alten Fehlereintrag (z. B. aus der Zeit, als die Abholung pausiert war oder Shelly kurz nicht erreichbar war). Die Abholung löscht alte Fehler zwar wieder, aber der Kunde sieht noch den alten Stand im Zwischenspeicher.
- Fehler werden nach einer erfolgreichen Abholung zuverlässig als erledigt markiert und die Anzeige lädt sie neu.
- Ein kurzer einzelner Aussetzer zeigt keinen Fehler mehr an, sondern erst wiederholte Fehlschläge (z. B. 3 in Folge).

## 3. Tacho zeigt 35 W statt ca. 9.488 W
Ursache ist im Code bestätigt: Tacho und Kennzahl-Kachel zählen alle Diagrammwerte des Zeitraums zusammen (Einstellung „Summe“). Bei Leistung in Watt ergibt das keinen sinnvollen Wert. Bei nur wenigen gespeicherten Werten kommen dann kleine Zahlen wie 35 heraus.
- Bei Leistungseinheiten (W/kW) zeigt der Tacho im Tag-Zeitraum den aktuellen Live-Wert, also denselben Wert wie unter Standort → Zähler.
- Für andere Zeiträume wird statt der Summe der Durchschnitt oder der Höchstwert angezeigt. „Summe“ gibt es weiterhin für Energie (kWh).
- Im Widget-Dialog steht ein kurzer Hinweis dazu.

## Abschluss
Changelog, Release Notes, Handbuch (4 Sprachen), Version v1.6.5 und Roadmap werden aktualisiert. Danach prüfe ich die Änderungen und lasse dich deployen.

## Technische Details
- `useGatewayLivePower` ruft `shelly-api getSensors` auf, und dieser Aufruf führt `persistSensorHistory` aus. Ich trenne das mit einem Parameter (z. B. `persist:false`) für Aufrufe aus dem Browser. Nur `shelly-periodic-sync`/Cron speichert Werte.
- Ich prüfe den Aufruf von `shelly-periodic-sync` durch `ems-cron-bundle` sowie die Funktionen `isWorkerEnabled` und `rejectIfNotInternal` auf Live.
- `CustomWidget` `kpiValue`: Für gauge/kpi mit Leistungseinheit wird im Tag-Zeitraum der Live-Wert aus `useGatewayLivePower` genutzt, sonst Durchschnitt oder Höchstwert.
- Für `integration_errors` kommen ein Schwellwert für aufeinanderfolgende Fehler und eine Cache-Invalidierung dazu.
