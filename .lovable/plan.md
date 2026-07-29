## Ausgangslage (verifiziert)

Der AICONO Gateway führt Automationen lokal aus und pusht die Exec-Logs an die Cloud:

- `docs/ha-addon/index.ts` → `pushExecutionLogs()` POSTet erfolgreiche/fehlerhafte Ausführungen an `gateway-ingest?action=push-execution-logs`.
- `supabase/functions/gateway-ingest/index.ts` → `handlePushExecutionLogs()` schreibt die Rows **nur** nach `automation_execution_log` (mit `execution_source = "local"`).
- Die UI-Karte in `src/components/locations/LocationAutomation.tsx` (Zeile 631/634) zeigt die Zeitangabe („vor 2 Tagen") aber aus **`location_automations.last_executed_at`** — und dieses Feld wird **nur** bei Cloud-Ausführungen aktualisiert (`useLocationAutomations.executeAutomation` Zeile 265–268 sowie der Cloud-Scheduler). Bei lokal ausgeführten Regeln bleibt es stehen.

Ergebnis: Test Toggle 1 (letzte Cloud-Ausführung vor 2 Tagen) und Test Toggle 2 (nie in der Cloud gelaufen) sehen in AICONO „veraltet / nie" aus, obwohl das Gateway sie um 07:59 / 08:04 lokal ausgeführt hat.

## Was zu tun ist

**Backend-Fix in `handlePushExecutionLogs` (Edge Function `gateway-ingest`):**

Nach dem erfolgreichen Insert in `automation_execution_log` zusätzlich für jede Automation den neuesten `executed_at` mit Status `success` bestimmen und `location_automations.last_executed_at` per `UPDATE ... WHERE id = ? AND (last_executed_at IS NULL OR last_executed_at < ?)` hochziehen. Damit:
- gewinnt immer der aktuellste Zeitstempel (egal ob Cloud- oder Local-Run),
- kein Downgrade bei out-of-order Push (Gateway war kurz offline),
- ein Batch-Push mit mehreren Regeln aktualisiert alle betroffenen Zeilen.

**Frontend-Härtung in `src/hooks/useLocationAutomations.tsx`:**

Für die UI-Anzeige zusätzlich den neuesten Erfolgs-Eintrag aus `automation_execution_log` in einen `lastSuccess`-Map einlesen (analog zum bestehenden `lastErrors`) und in `LocationAutomation.tsx` beim Rendern das Max aus `auto.last_executed_at` und `lastSuccess[auto.id]?.executed_at` nehmen. So funktioniert die Anzeige auch bei bereits historisch gepushten Logs sofort — unabhängig vom Backend-Fix.

**Ausführungsort-Info in der UI:**

Zusätzlich in `LocationAutomation.tsx` die Meta-Zeile ergänzen: bei Ausführungen aus `automation_execution_log` ein kleines `execution_source`-Kürzel („Lokal · vor 2 Std." / „Cloud · vor 5 Min.") anzeigen, damit der Nutzer erkennt, ob die Regel gerade lokal oder in der Cloud lief.

## Nicht Teil dieses Plans

- Keine Änderung an der lokalen Ausführungslogik im Gateway.
- Keine Migration nötig — `location_automations.last_executed_at` und `automation_execution_log` existieren bereits.
- Kein Gateway-Update erforderlich; der Fix wirkt sich beim nächsten Push-Zyklus (regelmäßig getriggert) automatisch aus.
