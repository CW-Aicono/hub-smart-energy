
Ziel: Ich habe die zeitgesteuerten Automationen tief geprüft. Ergebnis: Sie sollten grundsätzlich bereits laufen, und der Scheduler läuft auch tatsächlich. Das Hauptproblem ist aktuell nicht die Uhrzeit-/Zeitzonenlogik, sondern die konkrete Ausführung je Integration.

1. Ist-Zustand
- Es gibt eine Backend-Funktion `automation-scheduler`, die aktive Automationen periodisch auswertet.
- Die Zeitprüfung erfolgt nicht nach Server-UTC, sondern nach der in der Liegenschaft hinterlegten Zeitzone (`locations.timezone`, Fallback `Europe/Berlin`).
- Die Scheduler-Logs zeigen reale Ausführungen alle 2 Minuten, z. B. `conditions met in tz=Europe/Berlin at 16:46`.
- Damit ist die Frage zur Uhrzeit klar: Die Zeitlogik richtet sich lokal nach der Liegenschaft, nicht nach der Serverzeit.

2. Was bereits funktioniert
- Zeitbedingungen werden ausgewertet.
- Der Scheduler läuft produktiv.
- Manuelle Ausführung per Play-Button funktioniert weiterhin separat direkt aus dem Frontend.
- Für einzelne Integrationen funktioniert auch die geplante Ausführung bereits, z. B. Shelly wurde mehrfach erfolgreich als `scheduled` geloggt.

3. Warum es in Tests trotzdem “nicht funktioniert”
Es gibt mehrere unterschiedliche Fehlerursachen:

- Home Assistant:
  - Der Scheduler ruft pauschal `executeCommand` mit `controlUuid` + `commandValue` auf.
  - Die Home-Assistant-Funktion erwartet aber `domain`, `service`, `entity_id`, `service_data`.
  - Folge in Logs: `domain und service sind erforderlich`.
  - Bedeutet: zeitgesteuert schlägt fehl, obwohl die Zeitbedingung korrekt erkannt wurde.

- Loxone:
  - Scheduler trifft die Zeitfenster korrekt, aber einzelne Befehle schlagen mit `HTTP 404` fehl.
  - Das deutet auf eine fehlerhafte Command-/UUID-Zuordnung für bestimmte Aktoren hin, nicht auf ein Zeitproblem.

- Shelly:
  - Zeitgesteuerte Ausführung funktioniert grundsätzlich.
  - Es gibt aber zwischendurch `HTTP 429` beim Statusabruf, also Rate-Limit-Probleme.
  - Das kann dazu führen, dass einzelne Scheduler-Läufe fehlschlagen.

- Weitere Integrationen:
  - Der Scheduler ruft Gateway-Funktionen mit Service-Role-Authorization auf.
  - Nur Loxone, Shelly und Home Assistant akzeptieren diesen serverseitigen Aufruf bereits.
  - ABB, Siemens, Tuya, Homematic, Omada prüfen aktuell nur Benutzer-JWT und würden geplante Ausführungen daher serverseitig blockieren.
  - Für diese Integrationen sind zeitgesteuerte Automationen Stand jetzt also voraussichtlich noch nicht zuverlässig nutzbar.

4. Wichtige Erkenntnis
Die Aussage „zeitgesteuerte Automationen funktionieren nicht“ ist nur teilweise richtig:
- Die Zeitsteuerung selbst funktioniert.
- Der Scheduler funktioniert.
- Das eigentliche Problem ist die uneinheitliche Ausführungslogik der Integrationen und die fehlende Normalisierung der Action-Payloads.

5. Konkreter Umsetzungsplan
- Scheduler robuster machen:
  - Integrationsspezifische Action-Payloads statt pauschal `executeCommand`.
  - Für Home Assistant Mapping auf `domain/service/entity_id/service_data`.
  - Für Loxone saubere Command-Validierung und ggf. UUID-/Subcontrol-Mapping für problematische Aktoren.
- Alle Gateway-Funktionen vereinheitlichen:
  - Service-Role-Aufrufe für geplante Backend-Ausführung überall sauber zulassen.
  - Tenant-/Integrationsprüfung trotzdem serverseitig beibehalten.
- Fehlertransparenz verbessern:
  - Scheduled Errors im UI klarer anzeigen, damit man nicht nur `last_executed_at`, sondern auch die letzte Fehlursache sieht.
- Rate-Limit-Schutz ergänzen:
  - Insbesondere bei Shelly weniger aggressive Statusabfragen bzw. Retry/Backoff im Scheduler.
- Optional:
  - Cron-Setup im Projekt sichtbar dokumentieren bzw. absichern, da die Laufzeitlogs den Scheduler zeigen, aber im Code kein klarer SQL-Invocation-Job mit URL/Token sichtbar ist.

6. Rückmeldung für dich in Klartext
Stand heute:
- Loxone und andere Integrationen sollten zeitgesteuert prinzipiell bereits laufen.
- Die Zeitbasis ist korrekt lokal je Liegenschaft.
- In der Praxis funktionieren sie aber noch nicht durchgängig zuverlässig.
- Shelly läuft teilweise schon.
- Home Assistant läuft zeitgesteuert aktuell nicht korrekt.
- Mehrere andere Integrationen sind für Scheduler-Aufrufe aktuell noch nicht vollständig vorbereitet.
- Bei Loxone sind Zeittrigger aktiv, aber einzelne Commands schlagen noch fehl.

7. Technische Belege aus der Prüfung
- `automation-scheduler` loggt echte Zeitprüfungen in `Europe/Berlin`.
- In `automation_execution_log` gibt es `scheduled`-Einträge:
  - Shelly: mehrfach `success`
  - Home Assistant: mehrfach `domain und service sind erforderlich`
  - Loxone: mehrfach `Befehl fehlgeschlagen: HTTP 404`
- Mehrere Gateway-Funktionen unterstützen aktuell noch keinen Service-Role-Pfad für serverseitige Scheduler-Ausführung.

8. Empfohlene nächste Umsetzung
Ich würde als Nächstes genau diese drei Punkte umsetzen:
- Scheduler-Actions je Integration korrekt mappen
- Service-Role-Unterstützung für alle relevanten Gateway-Funktionen vereinheitlichen
- Fehleranzeige in der Automation-Kachel ergänzen, damit geplante Fehlschläge sofort sichtbar sind
