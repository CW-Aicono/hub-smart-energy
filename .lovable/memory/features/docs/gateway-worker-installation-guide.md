---
name: gateway-worker-installation-guide
description: VERWORFEN ab Plan v8.1 (April 2026). Der zentrale Cloud-Gateway-Worker auf Hetzner wurde komplett gestrichen. Stattdessen gilt: AICONO-Hub vor Ort (empfohlen, Echtzeit-Steuerung) ODER reines Cloud-Monitoring via bestehendes Edge-Function-Polling alle 5 Minuten (Fallback ohne Hub). Die Word-Anleitung AICONO_Gateway_Worker_Installation.docx ist in allen Versionen (v1–v8) obsolet und wird nicht weitergepflegt. Ordner docs/gateway-worker/ wurde nach docs/_DEPRECATED_gateway-worker/ verschoben.
type: feature
---

## Status: VERWORFEN (Plan v8.1, April 2026)

Der zentrale Gateway-Worker existiert nicht mehr und wird auch nicht mehr installiert.

## Finale Architektur

| Modus | Beschreibung |
|---|---|
| **A – AICONO-Hub vor Ort** | Empfohlen für Steuerung, Echtzeit-Daten (<1 s), komplexe Automationen, Offline-Resilienz. WebSocket Hub ↔ Cloud (analog OCPP-Wallbox-Pattern). |
| **B – Cloud-Monitoring ohne Hub** | Edge-Function-Polling (`loxone-api`, `shelly-api`, …) alle 5 min via `gateway-periodic-sync`. Reicht für Dashboard, Reports, Abrechnung. Keine Echtzeit-Steuerung. |

## Was nicht mehr existiert

- ❌ Hetzner-Container `gateway-worker-live` / `gateway-worker-staging`
- ❌ `SUPABASE_SERVICE_ROLE_KEY` außerhalb der Cloud
- ❌ `.env`-Variablen `WORKER_ENV`, `POLL_INTERVAL_MS`, `FLUSH_INTERVAL_MS`
- ❌ Worker-Heartbeat in `system_settings.worker_last_heartbeat` (kann optional bleiben für Hub-Status, ist aber kein Pflicht-Indikator mehr)

## Aktive Anleitung

Nur die **AICONO-Hub-Installationsanleitung** (HA-Add-on, lokales Setup) bleibt aktuell. Modus B braucht keine Endkunden-Anleitung – läuft serverseitig sobald Gateway-Credentials per UI-Wizard in `location_integrations.config` hinterlegt sind.

## Historie der verworfenen Word-Anleitung

- v1–v5: 1:1-Worker pro Tenant (Pi/Hetzner)
- v6: manuelles Key-Hinterlegen
- v7: Multi-Tenant-Umstellung
- v8: getrennte Supabase-Instanzen Live/Staging
- **v8.1: komplett verworfen – Architektur basiert nur noch auf Hub vor Ort + Edge-Function-Polling**
