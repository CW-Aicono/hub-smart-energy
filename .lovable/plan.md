## Finale Architektur-Entscheidung (Plan v8.1, April 2026)

**Der zentrale Cloud-Gateway-Worker entfällt komplett.** Er bot keinen Mehrwert gegenüber dem bestehenden Edge-Function-Polling.

## Zwei Betriebsmodi

| Modus | Verwendung | Latenz | Steuerung |
|---|---|---|---|
| **A – AICONO-Hub vor Ort** (empfohlen) | Echtzeit-Steuerung, komplexe Automationen, lokale Resilienz | < 1 s | ✅ Cross-Protokoll (Loxone WS, Shelly, Modbus, KNX, Home Assistant) |
| **B – Reines Cloud-Monitoring** (Fallback) | Kunden ohne Hub – Dashboard, Reports, Abrechnung | 5 min | ❌ nur lokale Geräte-Logik (z. B. Loxone-Programmierung auf Miniserver) |

## Wie Modus B technisch funktioniert (heutiger Zustand, bleibt unverändert)

- Edge Functions pollen alle 5 Minuten:
  `loxone-api`, `shelly-api`, `tuya-api`, `abb-api`, `siemens-api`,
  `homematic-api`, `omada-api`, `home-assistant-api`,
  `schneider-api`, `sentron-poc3000-api`
- Orchestriert via `gateway-periodic-sync` (pg_cron)
- Schreiben in `meter_power_readings` mit korrekter `tenant_id`
- UI-Live-Anzeige (`useGatewayLivePower`) pollt zusätzlich alle 60 s direkt für die Dashboard-Anzeige

## Wie Modus A technisch funktioniert

- AICONO EMS Gateway (Home Assistant Add-on, lokal auf Mini-PC/Pi)
- Spricht den Loxone Miniserver per **lokalem WebSocket** (Sub-100 ms)
- Baut **ausgehende WebSocket** zur Cloud auf (analog OCPP-Wallbox-Pattern)
- Sendet Live-Daten an `gateway-ingest` Edge Function
- Führt Automationen lokal aus (`automation-core`-Paket) → funktioniert auch bei Internet-Ausfall
- Puffert Messwerte in lokaler SQLite, synchronisiert nach Reconnect

## Was bleibt unverändert

- **Code**: keine Änderungen an Edge Functions, Hooks oder UI nötig
- **`useGatewayLivePower`** + **`useLoxoneSensors`**: bleiben aktiv
- **`useRealtimePower`**: greift weiterhin für Hub-Kunden via `meter_power_readings` Realtime-Subscription
- **OCPP-Wallboxen**: unverändert, direkter WebSocket zur Cloud

## Was wird verworfen

- ❌ `docs/gateway-worker/` → archiviert als `docs/_DEPRECATED_gateway-worker/`
- ❌ Hetzner-Worker-Container (`gateway-worker-live`, `gateway-worker-staging`)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` außerhalb der Cloud
- ❌ `WORKER_ENV`-Variable

## Anleitungen

- **Bestehend & aktuell**: AICONO-Hub-Installationsanleitung (für Modus A)
- **Entfällt**: AICONO_Gateway_Worker_Installation.docx (alle Versionen v1–v8 obsolet)
- Modus B braucht **keine Endkunden-Anleitung** – läuft serverseitig automatisch, sobald Gateway-Credentials in `location_integrations.config` hinterlegt sind (UI-Wizard)

## Vergleich der Entscheidung

| Aspekt | Cloud-Worker (verworfen) | Edge-Function-Polling (Modus B) |
|---|---|---|
| Zusätzliche Infrastruktur | 2 Hetzner-Container | keine |
| Service-Role-Key außerhalb Cloud | ja (Risiko) | nein |
| Aufwand neuer Mandant | Container-Restart | 0 |
| Latenz | 30 s | 5 min |
| Edge-Function-Kosten | minimal | aktuell, akzeptabel |
| Operative Komplexität | hoch | minimal |

## Geschätzter Aufwand

- ✅ Worker-Ordner archivieren (erledigt)
- ✅ Plan + Memory aktualisieren (erledigt)
- ❌ keine Code-Änderungen
- ❌ keine Migrations
