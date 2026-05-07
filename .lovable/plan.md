# AICONO Gateway v4 – Eigenständiges Linux-Edge-Device

Ziel: Das Gateway tritt als eigenständiges AICONO-Produkt auf (HA optisch unsichtbar), läuft auf **mehreren Hardware-Klassen** (Raspberry Pi und Industrie-PCs mit SSD/eMMC – alles Linux), wird vollständig aus dem Tenant-/Super-Admin-Backend remote konfiguriert (inkl. Sensoren/Aktoren/Zähler), führt Automationen lokal priorisiert aus und übernimmt OCPP-Bridging zu Modbus-Wallboxen.

## Entscheidungen (vom User bestätigt)

1. **Reihenfolge:** Phase 2 → 3 → 4 → 5 → 6. Phase 1 läuft parallel als Infrastruktur-Track.
2. **Architekturen:** `linux/amd64` + `linux/arm64`. Kein armv7.
3. **Erste Wallbox (Phase 5):** Mennekes Amtron Charge Control via Modbus TCP.
4. **Home Assistant** in Standardauslieferung enthalten (als Container im Stack).

## Architektur-Entscheidung: Container statt monolithisches OS-Image

Da die Hardware heterogen ist (Pi mit SD-Karte, Industrie-PCs mit SSD/eMMC, x86 + ARM), liefern wir keinen OS-Build, sondern einen **Docker-Stack** auf Debian 12 (Bookworm) Minimal:

- `aicono-gateway` – heutiger HA-Add-on-Worker (`docs/ha-addon/index.ts`), aus dem HA-Kontext gelöst und als eigenständiger Container
- `aicono-homeassistant` – Standard-HA-Container (für Shelly/MQTT/Modbus-Discovery), UI gebrandet/versteckt
- `aicono-ocpp-bridge` – neu in Phase 5

Provisioning:
- **Pi (Consumer):** Vorgefertigtes `.img.xz` (Debian + Docker + Stack), via Raspberry Pi Imager
- **Industrie-PC:** Bash-One-Liner-Installer auf bestehendem Debian/Ubuntu

Identifikation: weiterhin MAC + `gateway_username`/`gateway_password` (existierende `gateway-credentials`-Logik). Hardware-Fingerprint (DMI-UUID/Disk-Serial) als Fallback für Industrie-Hardware ohne reservierte MAC.

---

## Phase 2 – Vollständige Remote-Administration (START)

Ziel: Alle Add-on-Optionen aus heutiger `config.yaml` werden im Tenant-/Super-Admin-Backend gepflegt und in Echtzeit ans Gateway gepusht. Lokale UI bleibt als Debug-Panel.

### Backend
- Neue Tabelle `gateway_device_config` (gateway_device_id PK, config jsonb, version int, updated_at, updated_by) + RLS:
  - Tenant-User mit Zugriff auf das Gateway-Device dürfen lesen/schreiben
  - Super-Admin global
- Erweiterung der bestehenden `gateway-ws` Edge Function: neuer Realtime-Channel-Topic `config-update` (Postgres-Change-Trigger auf `gateway_device_config`)
- Neue Edge Function `gateway-device-config` (REST, JWT-geschützt):
  - `GET /:device_id` → liefert aktuelle Config (auch fürs Gateway selbst per Service-Role)
  - `PUT /:device_id` → schreibt neue Config-Version, Realtime-Push erfolgt automatisch über DB-Trigger
- UI-Dialog `GatewayConfigDialog.tsx` (neu, eingebunden in `useGatewayDevices`-Card und `SuperAdminTenants`):
  - Tabs „Polling/Sync", „Buffer/Backup", „Discovery", „Erweitert"
  - Form-Felder mit Defaults aus `config.yaml`
  - „An Gateway senden" Button → `gateway-device-config PUT`

### Gateway-Stack
- `index.ts` Refactor: Config-Quelle wird priorisiert
  1. Cloud (`gateway-device-config GET` via Service-Role-Equivalent: `GATEWAY_API_KEY`)
  2. Lokaler SQLite-Cache (`gateway_config_cache` Tabelle)
  3. `/data/options.json` (Bootstrap-Werte: nur `gateway_username`/`gateway_password`)
- Neuer Realtime-Listener auf `config-update` → Hot-Reload aller Worker-Intervalle ohne Container-Restart
- Lokale UI (`ui/`) bekommt Hinweis „Konfiguration wird zentral aus AICONO Cloud verwaltet" + Read-Only-Anzeige

### Reduktion HA-Sichtbarkeit (Vorbereitung Phase 1)
- `panel_title: "AICONO Gateway"` (statt EMS), `panel_icon` AICONO-Logo
- HA-Onboarding-Skip-Skript für Standardauslieferung

---

## Phase 3 – Remote-Setup von Sensoren, Aktoren, Zählern

- Tabelle `gateway_device_entities` (gateway_device_id, integration_type, config_json, mapping zu `meters`/`sensors`/`actuators`)
- Edge Functions:
  - `gateway-device-discover` – startet im Gateway einen mDNS-/MQTT-/Modbus-Scan und gibt Funde zurück
  - `gateway-device-provision` – provisioniert die Integration (HA Supervisor API für Shelly/MQTT, AICONO-eigener Modbus-Worker für Modbus TCP)
- UI: Wizard `RemoteDeviceWizard.tsx` mit Discovery + manueller Anlage; Mapping HA-Entity-ID ↔ AICONO-Meter/Sensor/Actuator über bestehende `deviceClassification.ts`

---

## Phase 4 – Remote- & Auto-Software-Updates

- Container-Image-Pull aus GHCR via Realtime-Befehl `update-now` (Stack führt `docker compose pull && up -d` aus)
- Optional: Debian `unattended-upgrades`
- Super-Admin → Infrastructure: Fleet-Tabelle (Stack-Version, Hardware-Klasse, Online, „Update jetzt", „Auto-Update-Plan z. B. Mo 03:00", Bulk-Update)
- Tabelle `gateway_update_jobs` (target_version, status, started_at, finished_at, error)

---

## Phase 5 – OCPP-Bridge zu Modbus-Wallboxen (Start: Mennekes Amtron Charge Control)

- Neuer Container `aicono-ocpp-bridge` (abgeleitet aus `docs/ocpp-persistent-server`)
- Liest Mennekes-Modbus-TCP-Register (Status, Energie, Strom, Leistung, RFID) via `modbus-serial`
- Eröffnet pro Wallbox eine OCPP-1.6-J-WebSocket-Verbindung zum bestehenden Hetzner-Persistent-Server
- Mappt Modbus → `BootNotification`, `Heartbeat`, `MeterValues`, `StatusNotification`, `Start/StopTransaction`, `Authorize`
- Empfängt OCPP-Commands (`RemoteStart/Stop`, `ChangeConfiguration`) → schreibt Modbus
- Konfiguration vollständig remote (Phase 2): Modbus-IP/Port/Slave-ID, Profile (zunächst nur „mennekes_amtron_charge_control"; ABB/Bender/Phoenix/Keba folgen)
- Backend legt automatisch `charge_points`-Eintrag mit `connection_type = 'bridged_modbus'` und Verweis aufs Gateway an

---

## Phase 6 – Automation-Sync mit Gateway-Priorität

- `automations`-Save → Trigger pusht `automation-sync` an alle relevanten Gateways via `gateway-ws`
- `cloud-scheduler` skippt Automation, wenn das Gateway in den letzten 3 min einen Heartbeat hatte
- Lokale Engine pusht `automation_executions`-Logs in die Cloud
- Bei Reconnect: Lokal hat Priorität, Cloud-Executions im Overlap-Fenster werden als `executor='cloud-fallback'` markiert (Deduplication)

---

## Phase 1 – White-Label-Linux-Stack & Multi-Hardware-Provisioning (Parallel-Track)

- Neues Repo bzw. Verzeichnis `docs/aicono-gateway-stack/` mit `docker-compose.yml`, `install.sh`, GitHub-Action für Multi-Arch-Build (`linux/amd64`, `linux/arm64`) auf GHCR
- Pi-Image via `pi-gen` Custom-Stage
- Hostname-Schema `aicono-gw-<MAC-Suffix>`, mDNS via `avahi`: `aicono-gateway.local`
- Branded Bootsplash/Login-Banner

---

## Aktueller Schritt

**Phase 2, Schritt 1:** Migration `gateway_device_config` + RLS + Postgres-Change-Trigger für Realtime-Push. Danach Edge Function + UI + Gateway-Worker-Refactor.
