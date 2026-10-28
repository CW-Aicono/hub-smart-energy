# Energieanalyse auf Live: kein Handbefehl mehr nötig

Die hochgeladene Datei enthält den alten Handbefehl, der die Auswertung für die Energieanalyse auf dem Live-Server einmalig anlegt. Version 1.12.2 übernimmt diese Aufgabe beim nächsten Deploy automatisch.

## Was beim nächsten Deploy passiert
- Die Auswertung wird automatisch neu angelegt, und zwar in einer robusteren Fassung als im Handbefehl.
- Falls die Auswertung trotzdem einmal fehlt, holt die Energieanalyse ihre Werte auf einem zweiten Weg. Sie bleibt also nicht leer.
- Die Dienste für Einladungs-, Bestätigungs- und Passwortmails starten bei jedem Deploy neu. So laufen auf Live sicher die aktuellen Fassungen.

## Falls der Befehl schon ausgeführt wurde
Das ist unschädlich. Der Deploy ersetzt die Auswertung danach durch die robustere Fassung.

## Am Programm ist nichts mehr zu ändern

## Nach dem Deploy prüfen
1. Die Energieanalyse mit Strg + F5 neu laden und schauen, ob Werte erscheinen.
2. Einen Test-Nutzer einladen und den Link in der Mail öffnen.
