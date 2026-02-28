
# Home Assistant Integration (aktualisiert)

## Zusammenfassung
Neue Gateway-Integration fuer Home Assistant mit zwei Kommunikationswegen:
1. **REST API** (Edge Function) -- Sensor-Polling alle 1 Minute + sofortige Aktor-Steuerung
2. **WebSocket API** (Edge Function) -- Persistenter Proxy fuer Echtzeit-Events und schnelle Steuerung

## Architektur-Entscheidung: WebSocket

Home Assistant bietet eine WebSocket API (`ws://<ha>:8123/api/websocket`), die sowohl Events als auch `call_service`-Befehle unterstuetzt. Da Edge Functions kurzlebig sind, wird das gleiche Muster wie beim bestehenden OCPP-WebSocket-Proxy verwendet:

- Eine neue Edge Function `ha-ws-proxy` haelt die WebSocket-Verbindung offen, solange ein Browser-Client verbunden ist
- Der Browser baut eine WebSocket-Verbindung zur Edge Function auf, die als Proxy zur HA-Instanz fungiert
- Steuerungsbefehle (`call_service`) werden in Echtzeit durchgeleitet
- Sensor-Events koennen optional live gestreamt werden

```text
Browser (UI)  <--WS-->  ha-ws-proxy (Edge Fn)  <--WS-->  Home Assistant
                                                          (Nabu Casa / Reverse Proxy)
```

Fuer das **minutliche Sensor-Polling** bleibt die REST-basierte Edge Function bestehen (wie bei allen anderen Gateways).

## Aenderungen

### 1. Gateway Registry erweitern
**Datei:** `src/lib/gatewayRegistry.ts`

Neuer Eintrag `home_assistant`:
- **Label:** Home Assistant
- **Icon:** `house` (lucide)
- **Edge Function:** `home-assistant-api`
- **Konfigurationsfelder:**
  - `api_url` (URL, erforderlich) -- z.B. `https://mein-ha.duckdns.org` oder Nabu Casa URL
  - `access_token` (Passwort, erforderlich) -- Long-Lived Access Token
  - `entity_filter` (Text, optional) -- Kommagetrennte Praefixe, z.B. `sensor.energy,switch.`

### 2. REST Edge Function (Sensor-Polling + Steuerung)
**Datei:** `supabase/functions/home-assistant-api/index.ts`

Aktionen:
- **`test`**: `GET /api/` mit Bearer Token -- Verbindungstest
- **`getSensors`**: `GET /api/states` -- alle Entities abrufen, nach `entity_filter` filtern, in Standard-Sensor-Format mappen:

| HA device_class | Sensor-Typ | Einheit |
|-----------------|------------|---------|
| power | power | W |
| energy | energy | kWh |
| temperature | temperature | C |
| voltage | voltage | V |
| current | current | A |
| humidity | humidity | % |
| switch.* / light.* | switch | on/off |

- **`executeCommand`**: `POST /api/services/<domain>/<service>` -- Aktor steuern (z.B. `switch/turn_on`, `light/toggle`). Wird fuer einfache Befehle ohne WebSocket verwendet.

### 3. WebSocket Proxy Edge Function (Echtzeit-Steuerung)
**Datei:** `supabase/functions/ha-ws-proxy/index.ts`

Architektur analog zu `ocpp-ws-proxy`:
1. Browser oeffnet WebSocket zu `wss://.../ha-ws-proxy/<locationIntegrationId>`
2. Edge Function liest HA-Credentials aus `location_integrations.config`
3. Edge Function oeffnet WebSocket zu HA (`wss://<ha-url>/api/websocket`)
4. Authentifizierung via `auth_required` -> `auth` Message mit Access Token
5. Bidirektionales Proxying:
   - **Browser -> HA**: `call_service`-Befehle (Licht an/aus, Heizung setzen, etc.)
   - **HA -> Browser**: `state_changed`-Events fuer Echtzeit-Updates

Nachrichten-Format (HA WebSocket API):
```text
-- Auth
{"type": "auth", "access_token": "..."}

-- Service aufrufen (Steuerung)
{"id": 1, "type": "call_service", "domain": "switch", "service": "turn_on",
 "target": {"entity_id": "switch.wohnzimmer"}}

-- Events abonnieren
{"id": 2, "type": "subscribe_events", "event_type": "state_changed"}
```

### 4. config.toml erweitern
**Datei:** `supabase/config.toml`

```toml
[functions.home-assistant-api]
verify_jwt = false

[functions.ha-ws-proxy]
verify_jwt = false
```

### 5. Periodische Synchronisierung
**Datei:** `supabase/functions/gateway-periodic-sync/index.ts`

Mapping erweitern:
```
home_assistant: "home-assistant-api"
```

### 6. UI: Live-Steuerung in Automation
**Datei:** `src/components/locations/LocationAutomation.tsx`

Der bestehende "Verfuegbare Aktoren"-Dialog zeigt aktuell nur Loxone-Aktoren. Erweiterung:
- HA-Entities vom Typ `switch`, `light`, `climate`, `cover` als steuerbare Aktoren anzeigen
- Bei Klick auf Steuerbefehl (On/Off/Toggle): REST-Call via `home-assistant-api` `executeCommand`
- Optional: WebSocket-Verbindung fuer sofortiges Feedback bei Statusaenderungen

## Dateien-Uebersicht

| Datei | Aenderung |
|-------|-----------|
| `src/lib/gatewayRegistry.ts` | Neuer `home_assistant`-Eintrag |
| `supabase/functions/home-assistant-api/index.ts` | Neue Edge Function (REST) |
| `supabase/functions/ha-ws-proxy/index.ts` | Neue Edge Function (WebSocket Proxy) |
| `supabase/functions/gateway-periodic-sync/index.ts` | Mapping erweitern |
| `supabase/config.toml` | Zwei neue Funktionen registrieren |
| `src/components/locations/LocationAutomation.tsx` | HA-Aktoren in UI integrieren |

## Hinweise
- **Keine neuen Secrets noetig** -- Access Token wird in `location_integrations.config` (JSONB) gespeichert, wie bei allen anderen Gateways
- **Keine DB-Migration noetig** -- nutzt bestehende Tabellen (`integrations`, `location_integrations`, `loxone_sensors`)
- **Nabu Casa empfohlen** -- einfachster Weg fuer externen Zugriff, HTTPS/WSS automatisch inklusive
- **Reverse Proxy** -- Alternative mit eigenem SSL-Zertifikat und Portweiterleitung
