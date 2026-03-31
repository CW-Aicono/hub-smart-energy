# Implementierungsplan: Home Assistant Gateway Add-on

## Übersicht

Ein vorkonfiguriertes Home Assistant Add-on, das als lokaler Gateway-Hub auf einem Raspberry Pi läuft. Es sammelt Daten von lokalen Geräten (Shelly, Schneider Modbus, Homematic etc.), puffert sie offline und pusht sie periodisch an die bestehende `gateway-ingest` API. Die App erhält eine Verwaltungsoberfläche für Backup, Update und Monitoring des Gateways.

## Architektur

```text
┌─────────────────────────────────────────┐
│  Raspberry Pi / Home Assistant OS       │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  HA Add-on (Node.js/Python)     │    │
│  │  ┌─────────┐  ┌──────────────┐  │    │
│  │  │ HA REST  │  │ Offline-     │  │    │
│  │  │ Polling  │  │ Buffer (SQLite)│ │    │
│  │  └────┬─────┘  └──────┬───────┘  │    │
│  │       │   Push via HTTPS  │       │    │
│  └───────┼───────────────────┼──────┘    │
│          │                   │           │
└──────────┼───────────────────┼───────────┘
           ▼                   ▼
   gateway-ingest Edge Function (bestehend)
           │
     meter_power_readings DB
```

## Phase 1: Gateway Add-on (Dateien außerhalb des Hauptprojekts)

**Neues Verzeichnis: `docs/ha-addon/**`

Das Add-on wird als Dokumentation/Vorlage im Repo mitgeliefert (wie `docs/gateway-worker/`).

### 1.1 Add-on Konfiguration

- `docs/ha-addon/config.yaml` – HA Add-on Manifest (Name, Slug, Arch: aarch64/amd64, Ports, Options)
- `docs/ha-addon/Dockerfile` – Container-Build auf Basis `node:20-alpine`
- `docs/ha-addon/package.json` + `tsconfig.json`

### 1.2 Kern-Logik: `docs/ha-addon/index.ts`

- **HA REST Polling**: Nutzt die lokale HA REST API (`http://supervisor/core/api/states`) mit `SUPERVISOR_TOKEN` (automatisch im Add-on verfügbar)
- **Entity-Mapping**: Liest Meter-Zuordnungen von `gateway-ingest?action=list-meters` und matcht `sensor_uuid` auf HA `entity_id`
- **Offline-Buffer**: SQLite-basierte Queue für Readings bei Netzwerkausfall. Automatisches Replay bei Wiederverbindung.
- **Push**: Batched POST an `gateway-ingest` mit `GATEWAY_API_KEY` (identisches Format wie der bestehende Gateway Worker)
- **Health-Endpoint**: Lokaler HTTP-Server (Port 8099) mit Status-API (`/api/status`, `/api/config`, `/api/version`)
- **Auto-Discovery**: Erkennt neue HA-Entitäten und meldet sie über einen neuen `gateway-ingest` Endpunkt

### 1.3 Konfigurationsoptionen (config.yaml)

```yaml
options:
  supabase_url: ""
  gateway_api_key: ""
  poll_interval_seconds: 30
  flush_interval_seconds: 5
  entity_filter: "sensor.energy,sensor.power"
  offline_buffer_max_mb: 100
```

## Phase 2: Gateway-Verwaltung in der App

### 2.1 Neue DB-Tabelle: `gateway_devices`

```sql
CREATE TABLE gateway_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_integration_id uuid REFERENCES location_integrations(id),
  device_name text NOT NULL,
  device_type text DEFAULT 'ha-addon',
  local_ip text,
  ha_version text,
  addon_version text,
  last_heartbeat_at timestamptz,
  status text DEFAULT 'unknown',
  config jsonb DEFAULT '{}',
  offline_buffer_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gateway_devices ENABLE ROW LEVEL SECURITY;
-- RLS: tenant-scoped SELECT/UPDATE for authenticated users
```

### 2.2 Heartbeat-Endpunkt in `gateway-ingest`

Neuer Action `POST ?action=heartbeat`:

- Add-on sendet periodisch (alle 60s) Status, Version, Buffer-Größe, HA-Version
- Upsert in `gateway_devices`
- Ermöglicht Online/Offline-Erkennung in der App

### 2.3 Gateway-Verwaltungs-UI

Neue Komponente `src/components/integrations/GatewayDeviceManager.tsx`:

- Liste registrierter Gateway-Devices mit Status (online/offline/buffer)
- Anzeige: Addon-Version, HA-Version, letzte Synchronisation, Buffer-Größe
- Buttons: "Update prüfen", "Backup erstellen", "Neustart"

### 2.4 Einbindung in bestehende Integrations-Seite

- Im `LocationIntegrationsList` für `home_assistant`-Integrationen eine Gateway-Device-Karte anzeigen

## Phase 3: Backup-Strategie

### 3.1 Add-on-seitiges Backup

- Das Add-on sichert seine SQLite-Queue und Konfiguration als Teil des **HA Snapshot-Systems** (automatisch durch HA Add-on Lifecycle)
- Zusätzlich: Export der lokalen Konfiguration als JSON an `gateway-ingest`

### 3.2 Cloud-seitiges Backup

- Neue Action `POST ?action=gateway-backup` in `gateway-ingest`:
  - Speichert Add-on-Config-Snapshot in `backup_snapshots` (erweitert bestehende Backup-Infrastruktur)
  - Inkludiert: Entity-Mappings, Polling-Config, Offline-Buffer-Statistik
- `tenant-backup` Edge Function erweitern: `gateway_devices` Tabelle in Backup-Set aufnehmen

### 3.3 Backup-Trigger aus der App

- Button "Gateway-Backup" in der GatewayDeviceManager-Komponente
- Triggert Backup-Request an den Heartbeat-Endpunkt des Add-ons (über `gateway-ingest` als Relay)
- Zusätzlich: automatisches Backup alle 24 Stunden aktivierbar

## Phase 4: Update-Strategie

### 4.1 Versions-Management

- Neue DB-Tabelle oder Spalte in `gateway_devices`: `latest_available_version`
- `gateway-ingest` Action `GET ?action=addon-version` liefert die aktuelle empfohlene Add-on-Version (gepflegt als Konfigurationswert oder Secret)

### 4.2 Update-Flow

1. Add-on prüft bei jedem Heartbeat, ob eine neue Version verfügbar ist
2. App zeigt Update-Badge bei veralteter Version
3. Update selbst erfolgt über den **HA Supervisor API** (`POST /addons/{slug}/update`) – wird vom Add-on selbst ausgelöst
4. App kann Update-Befehl per Relay senden: `gateway-ingest?action=gateway-command` → Add-on Health-Endpoint `/api/update`

### 4.3 Update-Benachrichtigung in der App

- `UpdateBanner`-Pattern wiederverwenden: Wenn `addon_version < latest_available_version`, Hinweis in der Integrations-Seite

## Umsetzungsreihenfolge


| Schritt | Beschreibung                                                  | Aufwand |
| ------- | ------------------------------------------------------------- | ------- |
| 1       | DB-Tabelle `gateway_devices` + RLS                            | Klein   |
| 2       | `gateway-ingest` erweitern: Heartbeat + Version-Check Actions | Mittel  |
| 3       | Add-on Grundgerüst (`docs/ha-addon/`) mit HA-Polling + Push   | Groß    |
| 4       | Gateway-Verwaltungs-UI in der App                             | Mittel  |
| 5       | Backup-Integration (Cloud + Add-on)                           | Mittel  |
| 6       | Update-Mechanismus + Benachrichtigungen                       | Mittel  |
| 7       | Offline-Buffer mit SQLite + Replay                            | Mittel  |
| 8       | Dokumentation + Setup-Anleitung                               | Klein   |


## Technische Details

- **Add-on Runtime**: Node.js 20 (wie der bestehende Gateway Worker) – maximale Code-Wiederverwendung
- **Bestehende Kompatibilität**: Das Add-on nutzt exakt dasselbe `gateway-ingest` API-Format wie der Docker Gateway Worker. Keine Breaking Changes nötig.
- **Sicherheit**: Kommunikation ausschließlich über HTTPS + GATEWAY_API_KEY Bearer Token. Lokale HA-Kommunikation über Supervisor-Token (kein Nutzer-Token nötig).
- **Offline-Grenze**: Konfigurierbar (Default 100 MB ≈ ~2 Mio. Readings). FIFO-Eviction bei Überschreitung.