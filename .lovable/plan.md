# Periodische WS-Reconnects AICONO-HA-Gateway – Diagnose-Plan

## Bestätigter Befund
Die Anzeige „Verbunden seit 3 Minuten" in der Super-Admin-Gateway-Flotte ist korrekt.
`gateway_devices.ws_connected_since` für `aicono-ems-2b1d07` steht unverändert auf `2026-07-26 07:33:24Z` (Alter ~3 Min), während `last_heartbeat_at` weiter im 60-Sekunden-Takt aktualisiert wird. `ws_connected_since` wird ausschließlich beim WS-Auth-Handshake (`gateway-ws/index.ts:744`) neu gesetzt und bei `tearDown` (`:543`) genullt — ein junger Wert = neuer WS-Reconnect.

Aus Anwendersicht wirkt das Gateway „online", weil der HA-Addon selbst durchläuft und der HTTP-Heartbeat unverändert weiterläuft; nur der persistente WebSocket zu `gateway-ws` bricht zyklisch ab.

## Ziel des Plans
Herausfinden, **wer** die WS-Verbindung alle paar Minuten schließt (Client / Edge Function / Netz-Zwischenschicht) und den Reconnect-Zyklus stoppen, ohne das Heartbeat-/Command-Handling zu regressen.

## Vorgehen

1. **Reconnect-Kadenz bestätigen**
   - Über 30 Minuten alle 60 s `ws_connected_since`, `last_heartbeat_at`, `last_ws_ping_at`, `status` für alle `device_type='aicono_ems'` sampeln (temporäre Log-Tabelle oder Skript-Notiz).
   - Erwartet: monoton wachsender `conn_min`, das dann sichtbar auf 0 zurückspringt.

2. **Serverseitige Ursache prüfen (`gateway-ws` Edge Function)**
   - Edge-Function-Logs (`gateway-ws`) auf `close`-, `auth_error`-, `pong-timeout`-, `heartbeat overdue`-Meldungen filtern, jeweils rund um die aus Schritt 1 identifizierten Reconnect-Zeitpunkte.
   - `pingIntervalMs`, `pongTimeoutMs`, `authTimeoutMs`, `maxIdleMs` in `gateway-ws/index.ts` verifizieren; Supabase-Edge-Funktions-Idle-Timeout (150 s) gegen eingesetzten Ping-Takt abgleichen.

3. **Clientseitige Ursache prüfen (HA-Addon)**
   - Add-on-Logs auf dem Gateway (`docs/ha-addon/`) für Reconnect-/Backoff-/Ping-Log-Zeilen sichten.
   - Ping/Pong-Intervall des HA-Addons und Reaktion auf `close`-Frames prüfen; bei Bedarf `keepalive` und `heartbeat`-Kadenz erhöhen (aktuell 60 s) bzw. WS-Ping deckungsgleich zu Edge-Function-Timeout setzen.

4. **Zwischenschicht ausschließen**
   - Cloudflare/Tunnel-Timeouts (`cloudflare-tunnel-domain` Memo) auf Idle-Cut prüfen (typisch 100 s Idle).
   - Falls Idle-Cut vermutet: WS-Ping-Intervall < 60 s setzen, sowohl clientseitig als auch serverseitig.

5. **Fix umsetzen**
   Genaue Änderung ergibt sich aus Schritt 2–4. Wahrscheinlichste Kandidaten:
   - Ping-Intervall in `gateway-ws` und HA-Addon angleichen (z. B. 45 s Client-Ping, 90 s Server-Timeout).
   - Fehlenden `pong`-Handler bzw. zu strengen `pong`-Timeout auf Serverseite entschärfen.

6. **Verifikation**
   - Nach dem Fix erneut 30 min sampeln; erwartet: `ws_connected_since` bleibt stabil (Alter wächst monoton, keine Sprünge auf 0).
   - `offline_buffer_count` bleibt 0, `pending_ocpp_commands`-Latenz unverändert.

## Nicht Teil dieses Plans
- Anzeige-/UI-Änderungen in der Gateway-Flotte (Wert ist korrekt).
- Änderungen am Loxone-WS-Worker (unabhängige Komponente).
- Änderungen am HTTP-Heartbeat- oder Ingest-Pfad.

## Technischer Kontext
- Betroffenes Gerät: `aicono-ems-2b1d07` (Realschule am Buchenberg, Stadt Steinfurt), Addon 3.3.0, HA 2026.5.2.
- Relevante Dateien: `supabase/functions/gateway-ws/index.ts`, `docs/ha-addon/`, `src/pages/SuperAdminGatewayFleet.tsx` (nur Lese-Referenz).
- Erwartetes Ergebnis: dauerhaft stabile WS-Verbindung (Alter im Stunden-/Tagesbereich statt Minuten), kein Delta zwischen Anzeige und Anwenderwahrnehmung mehr.
