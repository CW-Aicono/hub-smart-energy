

## Analyse: Uhrzeitgesteuerte Automationen funktionieren nicht

### Problem

Es gibt **keinen Backend-Scheduler**, der Automationen automatisch ausführt. Die Automationen können zwar Bedingungen vom Typ `time` (mit `time_from`/`time_to`) speichern, aber:

1. **Keine automatische Auswertung**: Es existiert keine Edge Function und kein Cron-Job, der periodisch prüft, ob die Zeitbedingungen einer Automation erfüllt sind und die Aktionen dann auslöst.
2. **Nur manuelle Ausführung**: `executeAutomation` im Frontend führt Aktionen direkt aus – ohne die gespeicherten Bedingungen (Zeit, Wochentag, Sensorwert) überhaupt zu prüfen.
3. **Zeitzonen-Frage**: Da kein Scheduler existiert, ist die Zeitzone derzeit irrelevant – es passiert schlicht nichts zeitgesteuert.

### Plan: Automation-Scheduler implementieren

#### 1. Neue Edge Function `automation-scheduler` erstellen

- Wird per Cron (alle 1–5 Minuten) aufgerufen
- Lädt alle aktiven Automationen mit `is_active = true`
- Prüft für jede Automation alle Bedingungen:
  - **`time`**: Vergleicht `time_from`/`time_to` mit der **aktuellen Uhrzeit in der Zeitzone der Liegenschaft** (aus `locations.timezone` oder Fallback `Europe/Berlin`)
  - **`weekday`**: Prüft aktuellen Wochentag
  - **`sensor_value`**: Holt aktuellen Sensorwert vom Gateway
  - **`status`**: Prüft Aktorstatus
- Verknüpft Bedingungen per `logic_operator` (AND/OR)
- Führt bei erfüllten Bedingungen die Aktionen aus (via bestehende Gateway-Edge-Functions)
- Setzt `last_executed_at` und verhindert Doppelausführung (Debounce: nicht erneut innerhalb von z.B. 5 Minuten)

#### 2. Zeitzone korrekt auflösen

- Neue Spalte `timezone` in der `locations`-Tabelle (falls nicht vorhanden), Default `Europe/Berlin`
- Der Scheduler rechnet alle Zeitvergleiche in die lokale Zeitzone der Liegenschaft um
- Damit gibt es keine 60-Minuten-Differenz mehr zwischen Server-UTC und lokaler Zeit

#### 3. Cron-Job einrichten

- `pg_cron` oder externer Cron ruft `automation-scheduler` alle 2 Minuten auf
- Alternativ: Der bestehende `loxone-periodic-sync` wird erweitert, um nach dem Sync auch die Automationen zu evaluieren

#### 4. `executeAutomation` im Frontend anpassen

- Manuelle Ausführung überspringt weiterhin die Bedingungsprüfung (bewusstes manuelles Triggern)
- Aber ein visueller Hinweis zeigt, ob die Automation aktuell "aktiv" ist (Bedingungen erfüllt) oder "wartend"

### Technische Details

- **Zeitzone**: `Intl.DateTimeFormat` in Deno mit `timeZone`-Option für korrekte lokale Zeit
- **Debounce**: Prüfung `last_executed_at` + Mindestabstand, um bei minütlichem Cron nicht mehrfach auszulösen
- **Logging**: Jede Auswertung und Ausführung wird geloggt für Nachvollziehbarkeit

