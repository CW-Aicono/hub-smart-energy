

# Plan: HA als vollintegriertes lokales Gateway – Konsolidiert mit Claude-Review

## Zusammenfassung

Der Raspberry Pi mit Home Assistant wird zum autonomen lokalen Gateway. Er sammelt Daten, führt Automationen lokal aus und synchronisiert bei Verbindung mit der Cloud. Claudes Review liefert vier klare Entscheidungen und vier zusätzliche Verbesserungen, die in den Plan einfließen.

---

## Entscheidungen aus dem Claude-Review

| Frage | Entscheidung |
|---|---|
| Evaluator-Portierung | **1:1 portieren**, Condition-Logik in gemeinsames Package `packages/automation-core/` extrahieren |
| WebSocket vs. REST | **Beides**: REST bleibt für Poller, WebSocket (`ws`) für lokales UI (Live-Sensoren) und Sensor-Trigger |
| UI-Framework | **Preact** via ESM-Import (`https://esm.sh/preact@10/compat`), kein Build-Schritt |
| Auth für lokales UI | **HA Ingress** (kein eigenes Auth, HA übernimmt Session-Management) |

## Zusätzliche Punkte aus dem Claude-Review

1. **Per-Device API-Key**: Jeder Pi bekommt einen eigenen Key, gebunden an `gateway_devices.id`. Validierung im `gateway-ingest` immer gegen `tenant_id` + `device_id`.
2. **Sync-Versionierung**: `updated_at` auf `location_automations` als Sync-Marker, damit ein Offline-Pi keine neuere Cloud-Version überschreibt.
3. **Priority-Buffer statt reinem FIFO**: Readings mit Werten über Schwellenwert bekommen ein `priority`-Flag und werden bei Eviction geschützt.
4. **Edge Runtime Testing**: Shared Package frühzeitig gegen Supabase self-hosted Deno-Runtime testen.

---

## Architektur

```text
┌───────────────────────────────────────────────────────┐
│  Raspberry Pi (Home Assistant OS)                     │
│                                                       │
│  ┌───────────────────────────────────────────────┐    │
│  │  EMS Gateway Hub Add-on (Node.js)             │    │
│  │                                               │    │
│  │  ┌──────────┐  ┌────────────────────────┐     │    │
│  │  │ Poller   │  │ Automation Engine      │     │    │
│  │  │ REST API │  │ (automation-core pkg)  │     │    │
│  │  │ → SQLite │  │ + HA Service Executor  │     │    │
│  │  └──────────┘  └────────────────────────┘     │    │
│  │                                               │    │
│  │  ┌──────────┐  ┌────────────────────────┐     │    │
│  │  │ Cloud    │  │ Web-UI (Preact/Ingress)│     │    │
│  │  │ Sync     │  │ + WebSocket zu HA      │     │    │
│  │  └──────────┘  └────────────────────────┘     │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Home Assistant Core (Supervisor API + WebSocket)     │
└───────────────────────────────────────────────────────┘
         │ Internet (optional)
         ▼
┌───────────────────────┐
│  Smart Energy Hub     │
│  Cloud (Supabase)     │
└───────────────────────┘
```

---

## Umsetzung in 5 Modulen

### Modul 1: Shared Automation Core Package

**Neu: `packages/automation-core/`**

- `evaluator.ts` – Portiert 1:1 aus `automation-scheduler/index.ts` (Zeilen 32-333):
  - `getLocalTimeParts()`, `isTimeInRange()`, Condition-Evaluation (time, time_point, time_switch, weekday, sensor_value, status)
  - Logik-Operator (AND/OR), Debounce-Prüfung
- `types.ts` – `AutomationCondition`, `AutomationAction`, Interfaces
- `executor.ts` – Interface `ActionExecutor` mit zwei Implementierungen:
  - Cloud: Ruft Edge Functions via HTTP (bestehend)
  - Lokal: Ruft HA REST API direkt (`/api/services/{domain}/{service}`)

Cloud-Scheduler (`automation-scheduler/index.ts`) wird refactored, um `automation-core` zu importieren.

### Modul 2: Lokale Automation Engine im Add-on

**Erweitert: `docs/ha-addon/index.ts`**

- SQLite-Tabelle `automations_local` (id, data JSON, updated_at, last_executed_at)
- SQLite-Tabelle `automation_exec_log` (id, automation_id, status, error, timestamp)
- Evaluator-Loop (alle 30s): Liest lokale Automationen, wertet Conditions aus, führt Actions via HA REST API aus
- Sensor-Schwellwert-Trigger: Optionaler WebSocket-Client (`ws`) für `subscribe_trigger` bei sensor_value-Conditions
- Debounce: 5 Minuten (identisch zum Cloud-Scheduler)

### Modul 3: Bidirektionaler Cloud-Sync

**Erweitert: `gateway-ingest/index.ts`** – Neuer Endpoint `?action=sync-automations`

- **Sync-Down** (Cloud → Hub):
  - Hub sendet `GET ?action=sync-automations&location_id=X&since=<updated_at>`
  - Gibt nur geänderte/neue Automationen zurück
  - Cloud ist Master (Versionierung via `updated_at`)
- **Sync-Up** (Hub → Cloud):
  - Lokale Execution-Logs werden beim Flush an `gateway-ingest` gepusht
  - Neuer Endpoint `POST ?action=push-execution-logs`
- **Per-Device API-Key** (Claudes Punkt):
  - `gateway_devices`-Tabelle erhält `api_key_hash`-Spalte
  - Validierung: Key + tenant_id + device_id Triple-Check
- **Offline-Indikator**: Neues Feld `execution_source: 'cloud' | 'local'` in `automation_execution_log`

### Modul 4: Lokales Web-UI (Preact + HA Ingress)

**Neu: `docs/ha-addon/ui/`**

- Statisches HTML/CSS/JS, ausgeliefert vom bestehenden HTTP-Server (Port 8099)
- **Preact** via ESM-Import (kein Build-Schritt)
- **HA Ingress**: `config.yaml` erhält `ingress: true` + `ingress_port: 8099`, UI erscheint in HA-Sidebar
- **AICONO-Design**: Dark Mode, Teal/Blau, Montserrat/Inter
- **WebSocket** zu HA für Live-Sensorwerte im Dashboard
- Seiten:
  1. **Dashboard**: Gateway-Status, HA-Version, Buffer, Online/Offline, Uptime
  2. **Sensoren**: Live-Werte via WebSocket
  3. **Automationen**: Aktive Regeln, Status, letzte Ausführung
  4. **Logs**: Execution-Log + System-Log
  5. **Einstellungen**: Anzeige der aktuellen Config

API-Endpunkte (Erweiterung HTTP-Server):
- `GET /api/sensors` – Live via HA WebSocket Cache
- `GET /api/automations` – Lokale Automationen + Status
- `GET /api/logs` – Execution-Log
- `GET /ui/*` – Statische Dateien

### Modul 5: Offline-Resilienz

- **Priority-Buffer** (Claudes Punkt): Readings über Schwellenwert erhalten `priority=1`, werden bei FIFO-Eviction geschützt
- **Connectivity-Watchdog**: Prüft Cloud-Erreichbarkeit alle 60s, setzt Sync aus bei Ausfall
- **Lokale Automationen laufen unabhängig** von Cloud-Verfügbarkeit
- **SQLite WAL-Mode** (bereits aktiv) für Crash-Sicherheit

---

## Technischer Kontext

### Tech Stack
| Schicht | Technologie |
|---|---|
| Frontend (Cloud) | React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Backend/DB | Supabase (PostgreSQL, GoTrue, Edge Functions/Deno) |
| Gateway Add-on | Node.js 20, better-sqlite3, ws, Alpine Docker |
| Lokales UI | Preact 10 (ESM), statisches HTML/CSS |
| Shared Logic | TypeScript Package (`automation-core`) |

### API-Architektur Hub ↔ Cloud
- **Hub → Cloud**: Outbound REST an `gateway-ingest`, Auth via `GATEWAY_API_KEY` (künftig per-device)
- **Cloud → Hub**: Indirekt via Heartbeat-Polling (`pending_command` in `gateway_devices`)
- **Lokal**: Health-Server Port 8099, HA Ingress für UI, HA REST/WebSocket für Gerätesteuerung

### Datenmodell
```text
tenants → locations → location_integrations → gateway_devices
                    → location_automations → automation_execution_log
                    → meters → meter_power_readings / _5min
```
- RLS-Isolation via `tenant_id = get_user_tenant_id()`
- `location_integrations.config` enthält verschlüsselte Credentials (AES-256-GCM)
- Automationen referenzieren `location_id` + dessen `timezone`

### Deployment (Hetzner)
- Docker Compose auf Ubuntu CX31 (4 vCPU, 16 GB)
- Nginx (SPA), self-hosted Supabase, Gateway Worker
- SSL via Traefik/Caddy
- HA Add-on auf Pi kommuniziert via HTTPS mit Hetzner

---

## Reihenfolge

| Schritt | Modul | Abhängigkeit |
|---|---|---|
| 1 | Shared Package (automation-core) | Keine |
| 2 | Lokale Automation Engine | Modul 1 |
| 3 | Cloud-Sync Endpoints | Modul 2 |
| 4 | Per-Device API-Key + Priority-Buffer | Modul 3 |
| 5 | Lokales Web-UI (Dashboard + Sensoren) | Bestehende APIs |
| 6 | Web-UI (Automationen + Logs) | Modul 2+3 |
| 7 | Offline-Watchdog | Modul 2+3 |

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `packages/automation-core/*` | NEU – Shared Evaluator/Types/Executor |
| `docs/ha-addon/index.ts` | Automation Engine, WebSocket, erweiterte APIs, Priority-Buffer |
| `docs/ha-addon/ui/*` | NEU – Preact UI (Dashboard, Sensoren, Automationen, Logs) |
| `docs/ha-addon/config.yaml` | `ingress: true`, neue Config-Optionen |
| `docs/ha-addon/Dockerfile` | UI-Dateien kopieren, `ws`-Dependency |
| `docs/ha-addon/package.json` | `ws`, `automation-core` Dependency |
| `supabase/functions/automation-scheduler/index.ts` | Refactor auf automation-core Import |
| `supabase/functions/gateway-ingest/index.ts` | `sync-automations` + `push-execution-logs` Endpoints |
| `.lovable/plan.md` | Aktualisiert mit konsolidiertem Plan |

