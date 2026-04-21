

## OCPP Persistent Server — Komplette Umsetzung

### Was du am Ende bekommst

1. **Persistenter OCPP-Server** (Node.js/TypeScript) — läuft 24/7 auf einem Hetzner-Server, hält die WebSocket-Verbindung zur Wallbox dauerhaft offen, kein Worker-Recycling mehr.
2. **Cloud-Integration** — der Server schreibt in die bestehenden Supabase-Tabellen (`charge_points`, `ocpp_message_log`, `pending_ocpp_commands`), die UI in Lovable funktioniert weiter wie gewohnt.
3. **Schritt-für-Schritt-Anleitung auf Deutsch** — komplett laienfreundlich, click-by-click, mit Screenshots-Hinweisen, ohne dass du Linux-Vorkenntnisse brauchst.
4. **Test- und Bugfixing-Support** — strukturierter Testplan, Log-Auswertung, Reaktion auf reale Fehler im 24h-Lauf.

### Stufe 1 — Diagnose-Verbesserung in der bestehenden Edge Function (sofort)

Datei: `supabase/functions/ocpp-ws-proxy/index.ts`
- Eindeutige `sessionId` pro Verbindung loggen
- Letzten eingehenden + ausgehenden Frame beim Close ausgeben
- Close-Code und Close-Reason loggen
- Einmalig beim Boot loggen, ob `ws.ping()` aufrufbar ist (`ping supported: yes/no`)
- Bestehenden Ping-Timer sauber in `onclose`/`onerror` aufräumen

Damit haben wir während der Migration weiter Sichtbarkeit und können belegen, dass die Disconnects wirklich aus der Edge-Laufzeit kommen.

### Stufe 2 — Neuer persistenter OCPP-Server

**Speicherort im Repo:** `docs/ocpp-persistent-server/`

Komplette Datei-Struktur, die ich anlegen werde:

```text
docs/ocpp-persistent-server/
├── src/
│   ├── index.ts                    # Einstiegspunkt, HTTP + WS Server
│   ├── ocppHandler.ts              # OCPP 1.6 Logik (BootNotification, Heartbeat, StatusNotification, Authorize, Start/StopTransaction, MeterValues)
│   ├── chargePointRegistry.ts      # In-Memory Registry pro Charge Point (Session, pendingCalls, lastSeen)
│   ├── supabaseClient.ts           # Supabase Service-Role Client
│   ├── commandDispatcher.ts        # Realtime-Subscription auf pending_ocpp_commands + Polling-Fallback
│   ├── messageLog.ts               # Schreiben in ocpp_message_log
│   ├── auth.ts                     # Basic Auth Validation gegen charge_points
│   ├── keepAlive.ts                # WebSocket Ping/Pong, Idle-Detection
│   ├── logger.ts                   # Strukturierte Logs mit sessionId
│   └── config.ts                   # Env-Variablen, Defaults
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml              # mit Caddy als TLS-Reverse-Proxy
├── Caddyfile                       # automatische Let's-Encrypt-Zertifikate für wss://
├── .env.example
├── README.md
└── HEALTHCHECK.md
```

**Was der Server fachlich kann:**
- Direkter WebSocket-Endpunkt für Wallboxen unter `wss://ocpp.<deine-domain>/<OCPP_ID>`
- OCPP-1.6-Subprotokoll, Basic-Auth-Prüfung gegen `charge_points`
- Eigenes Ping/Pong alle 25 s (echtes WebSocket-Ping aus `ws`-Lib, kein Edge-Workaround)
- Übernimmt Logik aus heutiger `ocpp-central`: BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, StopTransaction, MeterValues
- Schreibt jede Nachricht in `ocpp_message_log`
- Aktualisiert `charge_points.ws_connected_since`, `last_heartbeat`, `status`, `connector_status`
- Holt Remote-Befehle (RemoteStart/Stop, ChangeConfiguration, Reset, UnlockConnector) aus `pending_ocpp_commands`:
  - **Phase 1:** Polling alle 2 s
  - **Phase 2 im selben Code aktivierbar:** Supabase Realtime auf `pending_ocpp_commands` (Postgres Changes), kein Polling mehr nötig
- Korreliert OCPP-CallResults sauber über `messageId`, schreibt Antwort in `pending_ocpp_commands.response`
- HTTP `/health` Endpoint für Uptime-Monitoring
- Strukturierte JSON-Logs (für `docker logs` und spätere Auswertung)
- Saubere Cleanup-Logik bei Disconnect (Timer löschen, Registry-Eintrag entfernen)

### Stufe 3 — Frontend-Anpassung

Datei: `src/pages/OcppIntegration.tsx`
- Neue Konfigurations-Sektion „OCPP-Server-URL“: Auswahl zwischen
  - Lovable Cloud (alt, Edge-Function)
  - Eigener Server (neu, dauerhaft) — Eingabefeld für `wss://ocpp.<domain>`
- Anzeige der für die Wallbox einzutragenden URL inklusive Charge-Point-ID
- Hinweise klar formuliert (ws://-Fallback nur für Wallboxen ohne TLS-Support)

### Stufe 4 — Deployment-Anleitung für Hetzner (laienfreundlich, deutsch)

Neue Datei: `docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md`

Inhalt — komplett click-by-click, ohne Vorwissen:

1. **Hetzner-Konto anlegen** (Link, Schritte, Bezahlmethode)
2. **Server erstellen** — exakt: Standort Nürnberg, Image „Ubuntu 24.04“, Typ „CX22“ (~4 €/Monat), SSH-Key oder Passwort, IPv4 aktiviert
3. **Domain vorbereiten** — DNS-A-Record `ocpp.<deine-domain>` auf die Server-IP setzen, mit Beispiel-Screenshots-Hinweis für gängige Provider (Hetzner DNS, Strato, IONOS, Cloudflare)
4. **Erste Anmeldung am Server** — Windows: PuTTY oder Windows-Terminal; Mac: Terminal; jeweils mit Beispielbefehl und Screenshot-Hinweis
5. **Setup-Skript ausführen** — ein einziges Copy-&-Paste-Kommando, das automatisch installiert: Docker, Docker Compose, Firewall (UFW: nur 22, 80, 443 offen), Fail2Ban
6. **Projekt-Dateien hochladen** — zwei Wege beschrieben:
   - Variante A (einfachste): per `git clone` aus dem Lovable-Repo
   - Variante B (für Komplett-Anfänger): Dateien per WinSCP/Cyberduck hochladen, jeder Klick beschrieben
7. **`.env` ausfüllen** — Vorlage `.env.example` kopieren, Felder erklärt:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (wo finde ich die — Hinweis auf Lovable Cloud Backend-Bereich)
   - `OCPP_DOMAIN=ocpp.deine-domain.de`
   - `LOG_LEVEL=info`
8. **Container starten** — `docker compose up -d`, Verifikation mit `docker ps` und `curl https://ocpp.<domain>/health`
9. **Caddy & TLS-Zertifikat** — passiert automatisch beim ersten Start, dokumentierter Erfolgsindikator
10. **Wallbox umstellen** — exakt wo im Bender/Nidec-Webinterface die OCPP-URL eingetragen wird, alte URL → neue URL, mit Reboot-Hinweis
11. **Erfolgskontrolle in Lovable** — wo in der UI sichtbar ist, dass die Verbindung steht; was die Statusanzeige bedeutet
12. **Updates einspielen** — drei Befehle, vollständig erklärt
13. **Backup & Restart-Verhalten** — `restart: always` ist gesetzt, Server startet nach Strom-/Reboot-Ausfall automatisch
14. **Notfall-Rollback** — wie ich in 2 Minuten wieder die alte Edge-Function-URL aktiviere

### Stufe 5 — Test- und Bugfixing-Plan

Neue Datei: `docs/ocpp-persistent-server/TESTPLAN.md`

- **Smoke-Test (erste 10 Minuten):** Verbindung steht, BootNotification akzeptiert, Heartbeats kommen
- **Kurztest (1 Stunde):** keine Reconnects, Heartbeat-Lücken < 60 s
- **24-Stunden-Dauertest:** definierte Erfolgsmetriken, automatischer Log-Export
- **Reconnect-Test:** Wallbox kurz spannungsfrei, sauberer Re-Login innerhalb < 30 s, kein Mehrfach-`BootNotification`
- **Remote-Befehl-Test:** `RemoteStartTransaction` aus der UI auslösen, Antwort innerhalb < 3 s
- **Gegenprobe** mit `CoCSAG773` und `0311303102122250589`
- **Log-Auswertung-Cheatsheet:** welche Log-Zeile bedeutet was, was tun bei welchem Fehler

Beim Bugfixing arbeite ich strikt nach diesem Schema:
1. Du schickst mir die Symptome + Log-Ausschnitt (genauer Befehl steht in der Anleitung)
2. Ich analysiere und nenne dir die Korrektur
3. Du spielst sie per `git pull && docker compose up -d --build` ein (eine einzige Zeile)

### Datenbank

**Keine Schema-Änderungen erforderlich.** Wir nutzen die existierenden Tabellen:
`charge_points`, `pending_ocpp_commands`, `ocpp_message_log`, `charging_users`, `charging_sessions`, `charging_meter_values`.

Optional, aber empfohlen — eine kleine neue Tabelle `ocpp_connection_events` (open/close/close-code/reason/last-frame), damit wir Verbindungsabbrüche im Detail nachvollziehen können. Ich lege sie als optionale Migration mit an, aktiviere sie aber nur, wenn du das willst.

### Zeitlicher Ablauf der Umsetzung

1. Stufe 1 (Edge Diagnose) — sofort, in einem Schritt
2. Stufe 2 (Persistenter Server, Code komplett) — direkt im Anschluss, in einem Schritt
3. Stufe 3 (Frontend OCPP-URL-Auswahl) — direkt im Anschluss
4. Stufe 4 (Hetzner-Anleitung) — direkt im Anschluss
5. Stufe 5 (Testplan + Bugfixing-Cheatsheet) — direkt im Anschluss

Du musst zwischendurch nichts tun außer am Ende die Anleitung Schritt für Schritt durchgehen. Beim Deploy und Testen begleite ich dich aktiv: Du schickst mir Logs, ich antworte mit konkreten Befehlen.

### Antwort auf deine Frage

Ja, das geht alles. Sobald du den Plan freigibst, lege ich in einem Rutsch an:
- Diagnose-Verbesserung in der Edge Function
- Kompletter Code des persistenten OCPP-Servers (alle Dateien oben)
- Frontend-Erweiterung für die URL-Auswahl
- Komplette deutsche Hetzner-Anleitung (laienfreundlich)
- Testplan + Bugfixing-Cheatsheet

Danach starten wir gemeinsam Schritt 1 der Hetzner-Anleitung.

### Betroffene/neue Dateien (Übersicht)

- `supabase/functions/ocpp-ws-proxy/index.ts` (Diagnose-Logs)
- `src/pages/OcppIntegration.tsx` (URL-Auswahl)
- `docs/ocpp-persistent-server/**` (komplett neu — Server-Code, Docker, Caddy, Anleitung, Testplan)
- `.lovable/plan.md` (aktualisierter Stand)

