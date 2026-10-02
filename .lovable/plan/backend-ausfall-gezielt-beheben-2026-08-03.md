# Backend-Ausfall gezielt beheben

## Bestätigter Zustand

- Der Login erreicht den Auth-Dienst, scheitert aber mit **HTTP 504** und `context deadline exceeded`; anschließend kann keine neue Datenbanktransaktion begonnen werden.
- Die Datenbank ist grundsätzlich ansprechbar, aber **34 von 35 Verbindungen befinden sich in einem Wartezustand**.
- Die Cloud-Metriken selbst laufen in einen Timeout. Der allgemeine Status meldet zwar „erreichbar“, bildet die blockierten Datenbank-/Auth-Anfragen aber nicht ausreichend ab.
- Aktuelle REST-Anfragen kommen teilweise noch mit HTTP 200 durch. Es handelt sich daher um eine starke Blockade bzw. einen instabilen Zustand und nicht um einen Frontend- oder Passwortfehler.

## Sofortmaßnahme

1. Lovable Cloud Backend neu starten, damit Datenbank-Verbindungen, Pooler und Auth-Dienst sauber neu verbunden werden.
2. Den Cloud-Status bis zum vollständig gesunden Zustand prüfen.
3. Danach Datenbankgesundheit, wartende Verbindungen und Auth-Logs erneut messen.
4. Einen echten Login verifizieren; erwartet wird eine erfolgreiche Token-Antwort ohne 504.

## Ursachenanalyse nach Wiederherstellung

- Blockierende bzw. extrem lange Datenbankverbindungen exakt identifizieren.
- Die aktuell auffälligen Schreibpfade prüfen: `sensor_readings_raw` und `bridge_event_log` haben hohe Aufrufzahlen und einzelne Laufzeiten von mehreren Sekunden.
- Erst auf Basis dieser Messung eine dauerhafte Korrektur planen; keine kosmetische Änderung und kein pauschales Instance-Upgrade.

## Technische Leitplanken

- Keine Änderung am App-Code für den akuten Ausfall.
- Keine Migration oder weitere schwere Schreiboperation, solange der Backendzustand instabil ist.
- Neustart ist eine kurzzeitige Unterbrechung von Datenbank, Auth und Storage und benötigt die Freigabe im nächsten Schritt.