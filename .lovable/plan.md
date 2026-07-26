# AICONO Gateway: Worker vs. Edge Function – Entscheidung und nächste Schritte

## Empfohlene Entscheidung

**Das AICONO Gateway soll NICHT auf einen dedizierten WS-Worker umgestellt werden.** Die aktuelle Architektur (HA-Add-on → `gateway-ws` Edge Function) ist für den Push-Modus die bessere Wahl. Stattdessen wird die Edge-Function-Verbindung so gehärtet, dass die 3-Minuten-Isolate-Recycles als solche erkannt und in der UI korrekt dargestellt werden.

## Warum ein Worker für AICONO Gateway weniger Sinn macht als für Loxone

| Aspekt | Loxone Miniserver | AICONO EMS Gateway (HA-Add-on) |
|---|---|---|
| **Verbindungsrichtung** | Cloud muss aktiv zum Miniserver connecten (Remote Connect / DNS) | Gateway baut selbst Outbound-WSS zur Cloud auf |
| **Warum Worker nötig** | Loxone bietet keinen Cloud-Push-Client → Hetzner-Container holt Daten ab | Gateway ist selbst aktiver Client mit lokalem Puffer |
| **Infrastruktur-Overhead** | Akzeptabel, weil alternativlos | Vermeidbar, weil Push-Modell bereits funktioniert |
| **Single Point of Failure** | Ein Worker-Container für alle Loxone-Teststandorte | Ein Worker-Container für alle Kunden-Gateways wäre riskanter |
| **Berechtigungen außerhalb Cloud** | Braucht `GATEWAY_API_KEY` | Braucht nur MAC + Bcrypt-Passwort (sicherer) |

## Vorteile der aktuellen Edge-Function-Lösung

- Keine Hetzner-VM, kein Container-Monitoring, keine manuellen Deployments.
- Automatische Skalierung und Failover über Supabase-Isolate.
- Kein Service-Role-Key außerhalb der Cloud.
- Heartbeats und Steuerbefehle funktionieren trotz Isolate-Recycling.

## Nachteile und was wir dagegen tun

| Nachteil | Gegenmaßnahme | Status |
|---|---|---|
| `ws_connected_since` springt alle ~3 Min zurück | Seamless-Reconnect-Erkennung in `gateway-ws` (Heartbeat < 5 min → Timestamp erhalten) | Bereits umgesetzt |
| UI zeigt „Verbunden seit 3 Min" trotz stabilem Gateway | Status-Badge unterscheidet „Live" (Heartbeat frisch) von „Verbunden seit" | Im Plan unten |
| Reconnect-Overhead bei Befehlen | Exponentieller Backoff im HA-Add-on, schneller Reconnect (< 5 s) | Bereits vorhanden |
| IO-Last durch Auth-Handshakes | Auth-Cache / Session-Reuse in `gateway-ws` | Im Plan unten |

## Geplanter Umsetzungspaket

### 1. UI-Korrektur: „Verbunden seit" vs. „Live"

`src/pages/SuperAdminGatewayFleet.tsx` und ggf. `GatewayStatusBadge` anpassen:

- Primäres Kriterium bleibt `last_heartbeat_at` (max. 3 Min alt).
- Sekundäres Kriterium: `ws_connected_since`.
- Anzeige:
  - **Grün + „Live"** wenn Heartbeat frisch.
  - Tooltip oder Detailzeile: „WS-Kanal seit X, letzter Heartbeat Y".
  - Keine roten/amber-Badges mehr nur wegen Isolate-Recycle.

### 2. Edge Function: Auth-Handshake optimieren

`supabase/functions/gateway-ws/index.ts`:

- In-Memory-Cache für erfolgreiche Auth (Key: `mac`, TTL z. B. 60 s) innerhalb derselben Isolate.
- Wiederverwendung der Supabase-Realtime-Channel-Subscription bei Reconnect desselben Geräts.
- Verhindern, dass jeder Reconnect ein vollständiger DB-Auth-Roundtrip auslöst.

### 3. HA-Add-on: Reconnect-Verhalten verbessern

`docs/ha-addon/index.ts`:

- Schnellerer erster Reconnect-Versuch (z. B. 1 s, dann exponentiell bis 30 s).
- Beim Reconnect dieselbe `session_id` / Verbindungskennung senden, damit die Cloud den Recycle erkennt.
- Lokales Logging des Disconnect-Grunds, um Cloudflare/Idle-Timeouts von echten Fehlern zu unterscheiden.

### 4. Monitoring: „Gateway-Flotte" erweitern

`src/pages/SuperAdminGatewayFleet.tsx`:

- Neue Spalte „Reconnects / h" aus `bridge_event_log` oder einem neuen `gateway_ws_session_log`.
- Filter nach „nur echte Ausfälle" (Heartbeat > 3 Min alt) vs. „alle Recycles".

### 5. Optionale Zukunft: Dedizierter Hub-Worker für Enterprise

Für große Kunden mit > 50 Gateways oder < 1 s Echtzeit-Anforderungen kann später ein optionaler, **mandantenspezifischer** Hub-Worker auf Hetzner ergänzt werden. Das ist aber keine Standardarchitektur und wird erst nach Bedarf geplant.

## Nicht empfohlen

- Zentralen Cloud-Worker für alle AICONO-Gateways einführen.
- Loxone-WS-Worker-Code für AICONO-Gateways zweckentfremden (unterschiedliche Auth, unterschiedliche Datenflüsse).

## Nächster konkreter Schritt

Umsetzung von Paket 1–3 in einem separaten Build-Turn, falls du zustimmst.