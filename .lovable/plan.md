## Ziel

Bei `execution_mode = "hybrid"` darf eine Automation pro Trigger-Zyklus **genau einmal** ausgeführt werden — bevorzugt lokal auf dem Gateway (offline-fähig), Cloud nur als Fallback, wenn das Gateway nachweislich nicht ausgeführt hat.

## Ausgangslage (verifiziert im Code)

- `supabase/functions/automation-scheduler/index.ts` (Cloud): skippt Regeln, sobald irgendein `gateway_device` mit `status = 'online'` und Heartbeat < 5 Min am selben `location_integration_id` / `location_id` hängt — **unabhängig vom `execution_mode`**.
- `supabase/functions/gateway-ingest/index.ts` `sync-automations`: liefert an Gateway **alle** Regeln der Integration/Location zurück — **ohne** `execution_mode`-Filter.
- `docs/ha-addon/index.ts`: speichert alle synchronisierten Regeln in `automations_local` und evaluiert sie im 30 s-Loop, ohne `execution_mode` auszuwerten.

Daraus folgen zwei reale Doppelausführungs-Fenster:

1. **Heartbeat-Graubereich** (Gateway läuft, letzter Heartbeat 5–15 min alt): Cloud sieht „offline" und feuert — Gateway feuert parallel weiter.
2. **Mode-Mismatch**: Regeln mit `execution_mode = "cloud"` werden vom Gateway trotzdem lokal ausgeführt; Regeln mit `execution_mode = "loxone_local"` werden von der Cloud gefeuert, sobald Gateway kurz als offline gilt.

## Lösung: Owner-Lease + strikte Modus-Semantik

### 1. Modus-Semantik verbindlich machen

| execution_mode | Lokales Gateway | Cloud-Scheduler |
|---|---|---|
| `cloud` | **nicht** synchronisieren / **nicht** ausführen | immer ausführen |
| `loxone_local` | ausführen | **nie** ausführen (auch wenn Gateway offline) |
| `hybrid` | ausführen, wenn Lease gehalten | nur ausführen, wenn Lease abgelaufen (Fallback) |

### 2. Lease-Feld auf `location_automations`

Neue Spalten (Migration):
- `owner_gateway_device_id uuid` – aktueller Ausführungs-Owner
- `owner_lease_until timestamptz` – Ablauf der Lease (Cloud übernimmt erst danach)

Ein Owner-Wechsel geschieht atomar per `UPDATE ... WHERE owner_lease_until IS NULL OR owner_lease_until < now()`. Kein neues Cron nötig — die Lease wird beim `automation_execution_log`-Insert des Gateways verlängert.

### 3. Gateway-Ingest verschärfen

`sync-automations` liefert für ein Gateway nur Regeln mit `execution_mode IN ('loxone_local','hybrid')`. Regeln mit `execution_mode = 'cloud'` werden auch aktiv aus `automations_local` gepruned (Prune-Logik existiert bereits für „no longer in cloud").

Beim `automation-log`-Push (bereits vorhanden) verlängert der Ingest zusätzlich die Lease:
```sql
UPDATE location_automations
   SET owner_gateway_device_id = :gateway,
       owner_lease_until = now() + interval '90 seconds'
 WHERE id = :automation_id
   AND execution_mode = 'hybrid'
   AND (owner_gateway_device_id = :gateway OR owner_lease_until IS NULL OR owner_lease_until < now());
```

Damit „gewinnt" das Gateway, das zuletzt erfolgreich lokal ausgeführt hat, für 90 s die Führung. Das ist unabhängig vom `gateway_devices.status`-Feld und damit robust gegen Heartbeat-Aussetzer.

### 4. Cloud-Scheduler-Filter ersetzen

In `automation-scheduler` wird der bestehende „online-gateway"-Filter ersetzt durch pro Regel:

- `execution_mode = 'loxone_local'` → immer skippen.
- `execution_mode = 'hybrid'` → skippen, solange `owner_lease_until > now()`. Läuft die Lease ab (Gateway hat > 90 s nichts mehr gemeldet), feuert die Cloud einmalig, verlängert die Lease selbst auf sich (`owner_gateway_device_id = NULL`, `owner_lease_until = now() + 90s`) und loggt mit `execution_source = 'cloud'`.
- `execution_mode = 'cloud'` → wie heute (mit `isDebounceExpired`).

Die bestehende `last_executed_at`-Debounce bleibt zusätzlich global aktiv und verhindert Doppelfeuer innerhalb desselben Auswertungszyklus.

### 5. Gateway-Seite (ha-addon)

- Sync-Endpoint liefert bereits gefiltert (siehe 3), lokaler Ordner muss nur bereits vorhandene `cloud`-Regeln beim nächsten Full-Sync verwerfen (bestehende Prune-Logik greift automatisch).
- Kein zweiter Codepfad im Add-on nötig; Lease-Handling passiert serverseitig beim Log-Push.

### 6. UI-Feedback

`LocationAutomation.tsx`: Hybrid-Badge bekommt Tooltip „Aktiver Ausführungsort: Lokal (Lease bis HH:MM)" bzw. „Fallback Cloud aktiv" — abgeleitet aus `owner_gateway_device_id` und `owner_lease_until`. Keine neue API, Werte liegen in derselben Row.

## Betroffene Dateien

- SQL-Migration: `location_automations` + zwei Spalten, Index auf `(execution_mode, owner_lease_until)`.
- `supabase/functions/automation-scheduler/index.ts` – Filter-Logik gemäß §4.
- `supabase/functions/gateway-ingest/index.ts` – Filter in `sync-automations`, Lease-Update im Log-Handler.
- `src/hooks/useLocationAutomations.tsx` + `src/components/locations/LocationAutomation.tsx` – Tooltip/Anzeige.
- Keine Änderungen am Add-on-Sourcecode (`docs/ha-addon/index.ts`) nötig.

## Randfälle

- **Mehrere Gateways an einer Location**: Lease ist device-scoped → letztes erfolgreich ausführendes Gateway hält Lease; kein Duell.
- **Gateway wird deaktiviert**: Lease läuft nach 90 s ab → Cloud übernimmt.
- **Uhr-Skew Gateway ↔ Cloud**: Lease wird serverseitig gesetzt (`now()`), Gateway-Zeit egal.
- **`last_executed_at`-Debounce bleibt**: schützt zusätzlich vor Rennen innerhalb eines 30-s-Zyklus.

## Nicht Teil dieses Plans

- Änderung des Default-`execution_mode` beim Anlegen neuer Regeln (bleibt `cloud`).
- Verlagerung der Lease-Logik ins Add-on (bewusst serverseitig gehalten, um Add-on-Rollout zu vermeiden).
