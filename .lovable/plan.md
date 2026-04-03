
# Plan: HA als vollintegriertes lokales Gateway – Implementiert

## Status: ✅ Modul 1–5 implementiert

### Umgesetzte Module

#### Modul 1: Shared Automation Core Package ✅
- `packages/automation-core/types.ts` – Shared Interfaces (AutomationCondition, AutomationAction, AutomationRule, SensorProvider, ActionExecutor)
- `packages/automation-core/evaluator.ts` – 1:1-Portierung der Condition-Logik aus automation-scheduler (getLocalTimeParts, isTimeInRange, isNearTimePoint, evaluateCondition, evaluateAutomation)
- `packages/automation-core/executor.ts` – Integration-spezifische Payload-Builder (buildActionPayload, buildHALocalPayload, GATEWAY_EDGE_FUNCTIONS)
- `packages/automation-core/index.ts` – Re-exports

#### Modul 2: Lokale Automation Engine ✅
- SQLite-Tabellen: `automations_local`, `automation_exec_log`
- Evaluator-Loop alle 30s mit Debounce (5 Minuten)
- Action-Executor ruft direkt HA REST API (`/api/services/{domain}/{service}`)
- Sensor-Werte aus HA WebSocket Cache (latestHAStates)

#### Modul 3: Bidirektionaler Cloud-Sync ✅
- `gateway-ingest` erweitert um `?action=sync-automations` (GET) und `?action=push-execution-logs` (POST)
- Sync-Down: Hub holt aktive Automationen inkl. Location-Timezone
- Sync-Up: Lokale Execution-Logs werden an Cloud gepusht
- `execution_source`-Feld in `automation_execution_log` (cloud/local)
- `api_key_hash`-Feld in `gateway_devices` (vorbereitet für Per-Device Keys)

#### Modul 4: Lokales Web-UI ✅
- Preact 10 via ESM-Import (kein Build-Schritt)
- AICONO Dark-Mode Design (Teal/Blau, Montserrat/Inter)
- HA Ingress konfiguriert (`ingress: true`, `ingress_port: 8099`)
- 5 Seiten: Dashboard, Sensoren, Automationen, Logs, Einstellungen
- API-Endpunkte: `/api/sensors`, `/api/automations`, `/api/logs`, `/api/status`, `/api/config`

#### Modul 5: Offline-Resilienz ✅
- Priority-Buffer: Readings über Schwellwert erhalten `priority=1`
- FIFO-Eviction schützt Priority-Readings
- Connectivity-Watchdog prüft Cloud-Erreichbarkeit
- Automationen laufen offline unabhängig weiter
- HA WebSocket Client für Live-Sensorwerte

### Entscheidungen (Claude-Review)
| Frage | Entscheidung |
|---|---|
| Evaluator-Portierung | 1:1, in `packages/automation-core/` extrahiert |
| WebSocket vs. REST | Beides: REST für Poller, WebSocket für UI + Sensor-Trigger |
| UI-Framework | Preact via ESM |
| Auth für lokales UI | HA Ingress |

### Abgeschlossene Nacharbeiten ✅
- Cloud-Scheduler (`automation-scheduler/index.ts`) auf `automation-core`-Logik refactored (inlined für Deno-Kompatibilität, identische Funktionen)
- `execution_source: 'cloud'` wird bei Cloud-Ausführungen mitgeschrieben
- Per-Device API-Key Validierung in `gateway-ingest` aktiviert (SHA-256 Hash gegen `gateway_devices.api_key_hash`, Tenant-Crossover-Schutz)
- `getDeviceFromApiKey()` Helper für Tenant-Context-Extraktion
- `push-execution-logs` schreibt `execution_source` korrekt
- INSTALLATION.md auf v2.0 aktualisiert (neue Abschnitte: Dashboard, Automationen, Per-Device Keys)

### Nächste Schritte
- UI für Per-Device Key Generierung in der App erstellen
- Edge Runtime Kompatibilität des Shared Packages testen (Deno vs Node)
