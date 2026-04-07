

# Plan: Automations-Doppelausführung verhindern & exakte Zeitsteuerung

## Problemübersicht

| # | Problem | Ursache |
|---|---------|---------|
| 1 | Doppelausführung (Cloud + lokal) | Cloud-Scheduler evaluiert ALLE Automationen, ohne zu prüfen, ob ein lokales Gateway online ist |
| 2 | Ausführung 2 Min zu früh | `isNearTimePoint` hat ±2 Min Toleranz; HA-Gateway evaluiert alle 30s und feuert beim ersten Match |
| 3 | Kein Retry bei Fehler | `executeHAService` hat keine Wiederholungslogik |

---

## Änderung 1: Cloud-Scheduler überspringt lokal gesteuerte Automationen

**Datei:** `supabase/functions/automation-scheduler/index.ts`

Vor der Evaluierung jeder Automation prüft der Cloud-Scheduler, ob ein lokales Gateway (`gateway_devices`) für die zugehörige `location_integration_id` online ist (letzter Heartbeat < 5 Minuten). Wenn ja, wird die Automation übersprungen.

Logik:
1. Zu Beginn: Alle online Gateway-Devices laden (`status = 'online'` UND `last_heartbeat_at` < 5 Min)
2. Deren `location_integration_id`-Werte in ein Set sammeln
3. Pro Automation: Wenn `auto.location_integration_id` in diesem Set → skip mit Log `"skipped (local gateway online)"`

**Ergebnis:** Automationen werden nur dann von der Cloud ausgeführt, wenn kein lokales Gateway online ist (Fallback-Verhalten).

---

## Änderung 2: Exakte Zeitpunkt-Auswertung im HA-Gateway

**Dateien:** `docs/ha-addon/index.ts`, `packages/automation-core/evaluator.ts`

### 2a: Sekunden-genaue Zeitauswertung im Gateway

Die Funktion `isNearTimePoint` im HA-Gateway wird durch eine präzise, sekunden-basierte Variante ersetzt:

- Statt ±2 Min Toleranz auf Minuten-Ebene: exakter Vergleich auf **±30 Sekunden** um den Zielzeitpunkt
- Nutzt `Date` mit Sekunden-Auflösung statt nur `HH:MM`

```text
Vorher:  isNearTimePoint("08:28", "08:30") → true (diff=2 ≤ 2)
Nachher: isNearTimePoint("08:29:35") vs "08:30" → true  (diff=25s ≤ 30s)
         isNearTimePoint("08:28:00") vs "08:30" → false (diff=120s > 30s)
```

Konkret: `getLocalTimeParts` im Gateway um Sekunden erweitern. Neue Funktion `isExactTimePoint(timeStr, targetTime, toleranceSec = 30)` die auf Sekunden-Basis prüft.

### 2b: Shared evaluator (`automation-core`) bleibt unverändert

Die ±2-Min-Toleranz im `automation-core/evaluator.ts` bleibt erhalten, da der Cloud-Scheduler nur alle 2 Minuten läuft und diese Toleranz dort benötigt. Die Änderung betrifft nur die lokale (inlined) Kopie im HA-Gateway.

---

## Änderung 3: Retry-Logik für lokale Befehlsausführung

**Datei:** `docs/ha-addon/index.ts`

Die Funktion `executeHAService` wird um eine Retry-Logik erweitert. Neue Wrapper-Funktion `executeWithRetry`:

```text
executeWithRetry(entityId, cmdValue, maxRetries=3, delayMs=30000)
  for attempt 1..3:
    try executeHAService(entityId, cmdValue) → return success
    catch: log warning, wait 30s
  throw final error
```

In `evaluateAndExecuteAutomations`: Aufruf von `executeWithRetry` statt `executeHAService`. Bei endgültigem Fehlschlag: Log-Eintrag mit `status: "error"` und `error_message` inkl. Anzahl der Versuche.

---

## Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/automation-scheduler/index.ts` | Gateway-Online-Check vor Evaluierung |
| `docs/ha-addon/index.ts` | Sekunden-genaue Zeitauswertung + Retry-Logik |
| `packages/automation-core/evaluator.ts` | Keine Änderung |

