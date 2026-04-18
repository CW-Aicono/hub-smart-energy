# ⚠️ DEPRECATED – Nicht mehr verwenden

Dieser Ordner enthält den **zentralen Cloud-Gateway-Worker** (Hetzner-Docker-Container), der mit **Plan v8.1 (April 2026) verworfen** wurde.

## Warum verworfen?

Die finale Architektur-Entscheidung lautet:

| Anwendungsfall | Lösung |
|---|---|
| **Echtzeit-Steuerung & Automation** (< 1 s) | **Lokales AICONO-Gateway** vor Ort (empfohlen) |
| **Reines Monitoring** (kein Hub vorhanden) | Edge-Function-Polling alle 5 Minuten (`loxone-api`, `shelly-api`, `tuya-api`, …) – läuft bereits, keine zusätzliche Infrastruktur nötig |

Der zentrale Cloud-Worker bot keinen Mehrwert gegenüber dem bestehenden Edge-Function-Polling und wurde daher gestrichen.

## Was bleibt aktiv?

- `loxone-api`, `shelly-api`, `tuya-api`, `abb-api`, `siemens-api`, `homematic-api`, `omada-api`, `home-assistant-api`, `schneider-api`, `sentron-poc3000-api` → Edge Functions (5-min-Polling via `gateway-periodic-sync`)
- `gateway-ingest` → Push-Inbound für AICONO-Hub
- AICONO EMS Gateway (Home Assistant Add-on) → lokale Echtzeit-Steuerung

## Code-Archiv

Die Dateien (`index.ts`, `Dockerfile`, `package.json`, `tsconfig.json`) bleiben hier nur als historische Referenz. **Nicht deployen, nicht weiterentwickeln.**
