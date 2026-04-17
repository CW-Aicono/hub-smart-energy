

# MQTT Gateway-Integration

## Ziel
Generische Anbindung beliebiger Gateways/Geräte über **MQTT** als zusätzlichen Transport-Layer – ergänzend zu den bestehenden Cloud-API- und HTTP-Push-Integrationen (siehe `gatewayRegistry.ts`).

## Warum MQTT?
- **Industriestandard** für IoT/Building Automation (Tasmota, ESPHome, Zigbee2MQTT, KNX-MQTT-Bridge, Wago, Beckhoff, viele Wechselrichter, Wärmepumpen via EMS-ESP)
- **Push-basiert** (keine Polling-Last), niedrige Latenz, sehr ressourcenschonend
- Öffnet das System für **hunderte zusätzliche Geräte** ohne dedizierte Edge Function pro Hersteller

## Architektur

```text
Gerät/Bridge ──MQTT──► MQTT-Broker (Cloud)
                            │
                            │ Subscribe
                            ▼
                    MQTT-Bridge-Service (VPS, Docker)
                            │
                            │ HTTPS POST
                            ▼
                gateway-ingest Edge Function
                            │
                            ▼
                  Supabase (meter_power_readings, ...)
```

Wie beim OCPP-Cloud-Proxy: Die Brücke läuft als **schlanker Docker-Container auf dem bestehenden Hetzner-VPS** (kein lokaler Pi nötig), abonniert die MQTT-Topics und leitet Nachrichten in die bereits existierende `gateway-ingest`-Pipeline. Keine neue Datenbank-Logik nötig.

## Komponenten

### 1. Neuer Gateway-Typ `mqtt_generic` in `gatewayRegistry.ts`
Konfigurationsfelder pro Mandant:
- `broker_url` (z.B. `mqtts://mqtt.aicono.org:8883`)
- `username` / `password` (pro Mandant individuell)
- `topic_prefix` (z.B. `aicono/<tenant-slug>/#`)
- `payload_format` (Auswahl: `json`, `tasmota`, `esphome`, `homie`, `raw_value`)
- `device_mapping` (optional: `topic-pattern=meter-uuid`, kommagetrennt)

→ Keine eigene Edge Function nötig, nutzt `gateway-ingest`.

### 2. Cloud-MQTT-Broker (Mosquitto in Docker)
- Läuft auf VPS, Port 8883 (TLS) + Let's Encrypt
- Pro Mandant: eigener User + ACL auf `aicono/<tenant>/#`
- Anonyme Verbindungen deaktiviert

### 3. MQTT-Bridge-Service (`docs/mqtt-cloud-bridge/`)
Node.js/TypeScript-Service, der:
- Alle Mandanten-Topics abonniert
- Eingehende Payloads gemäß `payload_format` parst (JSON-Path, Tasmota-Schema, ESPHome-Schema, Homie-Convention)
- Per `device_mapping` Topic → `meter_id` zuordnet
- Pakete an `gateway-ingest` (POST mit `x-gateway-api-key`) weiterleitet
- Inkl. Reconnect, Backpressure-Buffer, Health-Endpoint

### 4. Dashboard-Anpassungen
- Neuer Eintrag im Integrations-Wizard "MQTT-Gerät" mit den oben genannten Feldern
- Anzeige der **persönlichen Mandanten-Zugangsdaten** (Broker-URL, User, Pass, Topic-Präfix) – analog zur OCPP-Detailseite
- Beispiel-Payloads + Topic-Struktur für die 4 unterstützten Formate
- Live-Topic-Inspector (optional, später): zeigt zuletzt empfangene Nachrichten zur Diagnose

### 5. Dokumentation
Word-Anleitung in `/mnt/documents/`:
- VPS-Setup für Mosquitto-Broker (einmalig durch Admin)
- Endkunden-Anleitung "Wie verbinde ich mein Tasmota-Gerät / ESPHome / KNX-Bridge mit AICONO"

## Datei-Übersicht

| Aktion | Datei |
|--------|-------|
| Editieren | `src/lib/gatewayRegistry.ts` (neuer Typ `mqtt_generic`) |
| Editieren | `src/lib/__tests__/gatewayRegistry.test.ts` |
| Editieren | Integrations-Wizard UI (Konfig-Felder + Anzeige der Verbindungsdaten) |
| Neu | `docs/mqtt-cloud-bridge/index.ts` |
| Neu | `docs/mqtt-cloud-bridge/Dockerfile` |
| Neu | `docs/mqtt-cloud-bridge/docker-compose.yml` (inkl. Mosquitto-Service) |
| Neu | `docs/mqtt-cloud-bridge/mosquitto.conf` |
| Neu | `docs/mqtt-cloud-bridge/package.json`, `tsconfig.json` |
| Neu | Edge Function `mqtt-credentials` (erzeugt/rotiert Mandanten-Credentials, schreibt Mosquitto-ACL) |
| Neu | DB-Migration: Tabelle `mqtt_credentials` (tenant_id, username, password_hash, topic_prefix) |
| Neu | Word-Anleitung `/mnt/documents/AICONO_MQTT_Integration.docx` |

## Sicherheit
- **TLS-Pflicht** (mqtts://, Port 8883), Klartext-Port 1883 deaktiviert
- Pro Mandant eigener Broker-User mit ACL → keine Cross-Tenant-Topics lesbar
- Bridge nutzt einen **Admin-User** mit Read-Only auf `aicono/#`
- Passwörter werden in der DB nur als bcrypt-Hash gespeichert; Klartext einmalig im UI angezeigt

## Optionale Erweiterungen (Phase 2)
- **Bidirektional**: Schaltbefehle von AICONO → MQTT (für Tasmota-Aktoren, Wallbox-Steuerung, etc.) – nutzt bestehende Automations-Engine
- **Auto-Discovery** via Home-Assistant-Discovery-Convention (`homeassistant/sensor/.../config`)
- **Bridge-Migration**: Bestehende Cloud-API-Gateways (Shelly, Tuya), die intern MQTT nutzen, könnten optional über die Bridge laufen → eine Verbindung statt N Polling-Loops

## Aufwandsschätzung
- Phase 1 (generische Anbindung, JSON + Tasmota): überschaubar, ~2-3 Implementierungs-Loops
- Mosquitto-VPS-Setup: einmalig, manuelle Anleitung wie bei OCPP-Proxy

