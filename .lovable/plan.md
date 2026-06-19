## Befund aus der Live-Prüfung

Der Backend-Zustand selbst ist erreichbar und stabil. Der Warnhinweis kommt sehr wahrscheinlich nicht von vollem Speicherplatz, sondern vom **I/O-Budget**: also wie viel Lesen/Schreiben die Cloud-Instanz pro Zeitraum leisten darf.

Wichtig: Die aktuelle Messung zeigt **nicht**, dass OCPP gerade der größte Daten-Schreiber ist.

Aktuelle Live-Werte:

- `ocpp_message_log`: ca. **120 Zeilen in 60 Minuten** = sehr gering.
- `ocpp_meter_samples`: ca. **60 Zeilen in 60 Minuten** = sehr gering.
- `meter_power_readings`: ca. **1.220 Zeilen in 60 Minuten** = deutlich mehr.
- Edge Function `ocpp-persistent-api`: ca. **221 Aufrufe in 60 Minuten**.
- Top-Last laut Datenbankstatistik:
  - `meter_power_readings` Inserts: ca. **5,13 Mio. Aufrufe** historisch in der Statistik.
  - `location_integrations` Updates: ca. **2,33 Mio. Aufrufe** historisch in der Statistik.
  - Leseabfragen auf `meter_power_readings`: sehr teuer.
  - `integration_errors` Prüfung: ebenfalls auffällig.

Zusätzlich auffällig: `ocpp-persistent-api` zeigt sehr viele `booted` / `shutdown` Logs. Das heißt: die Funktion wird sehr häufig kurz gestartet und beendet. Das ist nicht zwingend ein Datenbank-Schreibproblem, erzeugt aber unnötige Backend-Arbeit.

## Sehr wichtiger Punkt

Die Änderung am OCPP Persistent Server reduziert die Last **erst dann vollständig**, wenn der externe Persistent Server wirklich neu gebaut / neu gestartet / neu deployed wurde. Die Datenbank- und Edge-Function-Seite ist vorbereitet, aber der Prozess außerhalb von Lovable muss die neue Batch-Logik auch tatsächlich verwenden.

Trotzdem zeigen die aktuellen Tabellenzahlen: selbst wenn OCPP noch nicht optimal läuft, ist OCPP aktuell nicht der sichtbar größte Datenbank-Schreiber.

## Ziel

Jetzt keine dritte Rateschleife, sondern ein messbarer Akut-Fix:

1. Schreiblast sofort senken.
2. Keine Messwerte verlieren, die für Energieauswertung nötig sind.
3. Keine OCPP-Logs löschen.
4. Danach erneut messen, ob das I/O-Budget fällt.

## Plan zur Umsetzung

### Schritt 1: Leselast auf `meter_power_readings` prüfen und gezielt indizieren

Ich prüfe die vorhandenen Indizes und die konkreten Abfragepläne für:

- Zeitreihen-Abfragen pro Zähler und Zeitraum.
- Maximum-/Peak-Abfragen pro Zähler und Zeitraum.

Wenn ein passender Index fehlt, lege ich gezielt einen Index an, zum Beispiel für:

- `meter_id + recorded_at`
- optional für Peak-Abfragen zusätzlich passend zur Sortierung nach `power_value`

Erwarteter Effekt:

- Weniger Disk-Lesen bei Dashboards und Graphen.
- Weniger I/O-Verbrauch ohne Datenverlust.

### Schritt 2: Schreiblast bei `meter_power_readings` entschärfen

Ich suche die Stellen, die `meter_power_readings` schreiben, besonders Gateway-/Loxone-/Shelly-/OCPP-Pfade.

Ziel ist **nicht**, Daten zu verlieren, sondern doppelte oder unnötig kleinteilige Schreibvorgänge zu vermeiden:

- gleiche Messwerte im gleichen engen Zeitfenster nicht mehrfach speichern,
- wenn möglich Batch-Insert statt vieler Einzel-Inserts,
- bestehende 5-Minuten-Aggregation nicht umgehen.

Erwarteter Effekt:

- Weniger einzelne Datenbank-Schreibvorgänge.
- Historische Kurven bleiben erhalten.

### Schritt 3: `location_integrations`-Status-Updates endgültig begrenzen

Die vorherige Änderung reduziert echte Datenbank-Updates auf 5 Minuten. Ich prüfe aber, ob noch Codepfade direkt `location_integrations` aktualisieren und die neue Drosselung umgehen.

Falls ja:

- direkte Updates ersetzen durch die gedrosselte Funktion,
- harte 5-Minuten-Grenze überall einheitlich verwenden,
- Statuswechsel weiterhin sofort speichern.

Erwarteter Effekt:

- Weniger Update-Last und weniger tote Zeilen.

### Schritt 4: `integration_errors`-Prüfung optimieren

Die Statistik zeigt viele Abfragen nach:

- `location_integration_id`
- `error_type`
- `is_resolved` / `is_ignored`

Ich prüfe, ob dafür ein passender Teilindex fehlt. Falls ja, lege ich einen gezielten Index für offene/aktive Fehler an.

Erwarteter Effekt:

- Weniger Disk-Lesen bei Fehlerprüfung und Auto-Resolve-Logik.

### Schritt 5: OCPP sauber fertigziehen, aber nicht als Hauptursache behandeln

OCPP bleibt wichtig, aber aktuell ist es nicht der größte Schreibtreiber.

Ich prüfe:

- ob `log-messages-batch` wirklich aufgerufen wird,
- ob Request/Response-Pairing greift,
- ob der Persistent Server noch die alte Einzel-Logik nutzt.

Falls der externe Persistent Server noch nicht aktualisiert ist, gebe ich dir danach eine sehr klare Anfänger-Anleitung, wie du ihn neu bauen / neu starten kannst.

### Schritt 6: Nach jeder Änderung messen

Nach den Änderungen prüfe ich wieder:

- Backend Health,
- Top Slow Queries,
- Tabellen-Schreibzahlen,
- Edge-Function-Aufrufe der letzten 60 Minuten.

Nur wenn danach weiterhin 100% Disk-I/O-Budget steht, ist der nächste sachliche Schritt eine temporäre größere Lovable-Cloud-Instanz. Das wäre dann kein Code-Bug mehr, sondern schlicht zu wenig I/O-Leistung für die aktuelle Last.

## Was ich bewusst nicht mache

- Keine OCPP-Logs löschen.
- Keine historischen Messwerte löschen.
- Kein Sampling bei OCPP Heartbeats als Sofortmaßnahme.
- Keine riskante Tabellen-Partitionierung als ersten Schritt.
- Kein Backend-Neustart als „Blindfix“, solange die Datenbank erreichbar ist.

## Erwartetes Ergebnis

Nach Umsetzung sollten die auffälligen Datenbankabfragen weniger Disk-I/O verbrauchen. Besonders wichtig sind jetzt `meter_power_readings`, `location_integrations` und `integration_errors`; OCPP wird parallel verifiziert, aber nicht mehr als Hauptursache angenommen.