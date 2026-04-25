# OCPP 1.6 Wallbox-Simulator — Plan

## Ziel
Ein webbasiertes Tool zum Testen des OCPP-Backends (`wss://ocpp.aicono.org`). Es simuliert eine oder mehrere Wallboxen, sendet OCPP-1.6-JSON-Nachrichten (Boot, Heartbeat, StatusNotification, StartTransaction, MeterValues, StopTransaction) und reagiert auf Remote-Commands vom Server (RemoteStart/Stop, Reset).

## Architektur-Entscheidung: Separates Projekt
**Empfehlung:** Neues Lovable-Projekt `ocpp-wallbox-simulator`.

| Pro separates Projekt | Pro Integration ins EMS |
|---|---|
| Eigene URL (`ocpp-sim.lovable.app`) — auch für Partner/Kunden | — |
| Kein RLS-/Tenant-Risiko | — |
| Frei deploybar/verwerfbar | — |
| Saubere Trennung Test-Tool vs. Produktiv-EMS | — |

Entscheidung: **Separates Projekt**.

---

## Phase 1 — Projekt-Setup
- Neues Lovable-Projekt mit Lovable Cloud
- Tabelle `simulator_charge_points` (id, name, ocpp_id, password, vendor, model, serial, last_used_at)
- Tabelle `simulator_sessions` (id, charge_point_id, started_at, stopped_at, last_status, transaction_id, meter_start, meter_stop, log JSONB)
- AICONO-CI (Dark, Blue/Teal, Montserrat/Inter) für visuelle Konsistenz

## Phase 2 — WebSocket-Proxy (Edge Function)
**Problem:** Browser können bei WebSocket-Handshakes keine `Authorization: Basic ...`-Header setzen.

**Lösung:** Edge Function `ws-proxy` als Relay:
- Browser ↔ `wss://<projekt>.functions.supabase.co/ws-proxy?target=<url>&user=<id>&pass=<pw>` ↔ Wallbox-Server
- Edge Function nutzt `Deno.upgradeWebSocket` und öffnet nach Auth eine ausgehende WS-Verbindung mit Basic-Auth-Header
- Forwardet bidirektional alle Frames 1:1
- Subprotocol `ocpp1.6` durchreichen
- Logging der Frames für Debug

Damit funktionieren:
- `wss://ocpp.aicono.org/<cpId>` (Produktion mit TLS + Basic Auth)
- `ws://lokaler-server:8080/<cpId>` (lokaler Test ohne TLS)

## Phase 3 — Simulator-Engine (Frontend)
TypeScript-Modul `OcppClient`:
- Verbindungs-Management (connect, disconnect, reconnect mit Backoff)
- OCPP-Frame-Builder (CALL `[2,id,action,payload]`, CALLRESULT `[3,...]`, CALLERROR `[4,...]`)
- Pending-Call-Map (UUIDs → Promises) für CALLRESULT-Zuordnung
- Heartbeat-Scheduler (Intervall aus BootNotification-Antwort, default 30 s)
- Handler für Server-CALLs:
  - `RemoteStartTransaction` → automatisch `StartTransaction` auslösen
  - `RemoteStopTransaction` → `StopTransaction` auslösen
  - `Reset` → Reconnect simulieren
  - `ChangeConfiguration`, `GetConfiguration`, `TriggerMessage` → Standardantworten
- MeterValues-Scheduler während aktiver Transaktion (alle 60 s, konfigurierbar)

## Phase 4 — UI: Einzelne Wallbox
Eine Seite pro simulierter Wallbox mit Tabs/Cards:

**Verbindung:**
- Eingaben: Server-URL, OCPP-ID, Passwort (optional)
- Toggle `wss` / `ws`
- Buttons: Verbinden / Trennen
- Status-Badge: Disconnected / Connecting / Connected / Authenticated

**Boot & Identity:**
- Vendor, Model, Serial, FirmwareVersion (editierbar, Defaults Bender/Nidec-like)
- Button: BootNotification senden
- Anzeige: gewährter HeartbeatInterval

**Connector-Status:**
- Auswahl Connector-ID (1 oder 2)
- Status-Auswahl: `Available`, `Preparing`, `Charging`, `SuspendedEV`, `Finishing`, `Faulted`
- Button: StatusNotification senden

**Ladevorgang simulieren:**
- idTag-Eingabe
- Connector-Auswahl
- Meter-Start (Wh)
- Slider: Ladeleistung (kW), Dauer (Min)
- Button: Start → sendet StartTransaction, generiert MeterValues alle 60 s, inkrementiert Energy-Register linear
- Button: Stopp → sendet StopTransaction mit finalem Meter-Wert
- Live-Anzeige: aktuelle Energy, geladene Zeit, geschätzte Endenergie

**Live-Frame-Log:**
- Scrollbare Liste aller gesendeten/empfangenen Frames
- Farbig: outgoing (blau), incoming (grün), error (rot)
- Filter: nach Action
- Export als JSON

## Phase 5 — UI: Multi-Charger-Dashboard
- Liste aller gespeicherten Wallboxen mit Status-Indikator
- "Alle verbinden" / "Alle trennen"
- "Heartbeat-Storm" für Last-Tests (z. B. 50 Wallboxen parallel)
- Übersicht aktiver Transaktionen

## Phase 6 — Presets & Persistenz
- CRUD für `simulator_charge_points` (Name, OCPP-ID, Passwort, Default-Server)
- Quick-Connect aus Liste
- Letzte 50 Sessions mit Frame-Log persistieren (für Nachanalyse)

## Phase 7 — Komfortfunktionen
- **Auto-Heartbeat-Toggle** (an/aus, Intervall-Override)
- **Reconnect-on-Drop** (Toggle + Backoff-Strategie)
- **Frame-Injector**: beliebigen JSON-Frame manuell senden (für Edge-Cases)
- **Szenario-Recorder**: Aufzeichnen einer Frame-Sequenz und als Test-Szenario abspielen
- **Vorlagen** für gängige Fehler: `FaultedConnector`, `MeterValueOverflow`, `Auth-Reject`

## Out of Scope (vorerst)
- OCPP 2.0.1 (anderes Protokoll, Plug & Charge, ISO 15118)
- Smart Charging Profiles (`SetChargingProfile`) — kann in Phase 8 nachgezogen werden
- Echte CSMS-Funktion (ist bewusst nur Client-Simulator)

## Geschätzter Aufwand
- Phase 1–3: Grundlauffähig (Verbinden, Boot, Heartbeat, eine Transaktion) — kleinere Iteration
- Phase 4–5: Vollständige UI für 1+ Wallboxen — mittlere Iteration
- Phase 6–7: Komfort & Persistenz — mehrere kleinere Iterationen

## Vorgehen nach Plan-Freigabe
1. **Du legst neues Lovable-Projekt an** (`ocpp-wallbox-simulator`), aktivierst Lovable Cloud
2. Du sendest mir den Projekt-Link, ich kann dort weiterarbeiten
3. Wir starten mit Phase 1–3 (MVP: 1 Wallbox, Boot + Heartbeat + Transaktion gegen `wss://ocpp.aicono.org`)
4. Iteration nach deiner Validierung
