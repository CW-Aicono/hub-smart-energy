
# Feldtest: Loxone Remote Connect als WebSocket-Transport

## Ziel
Mit 2–3 Test-Tenants prüfen, ob eine **persistente WebSocket-Verbindung** vom AICONO-Cloud-Backend zum Miniserver **über Loxone Remote Connect** stabil genug ist, um das 15-Minuten-Polling langfristig durch Echtzeit-Streaming zu ersetzen.

## Was getestet wird
- Verbindungsaufbau über die Remote-Connect-URL (`https://dns.loxonecloud.com/<serial>`) statt direkter LAN-IP/DDNS
- Stabilität einer **dauerhaft offenen WS-Session** über Tage/Wochen
- Verhalten bei: Miniserver-Reboot, Internet-Ausfall am Standort, Token-Ablauf, Cloud-Wartung bei Loxone
- Datenfluss: Wechseln Status-Events tatsächlich in Echtzeit ein (kein erneutes Polling nötig)?
- Skalierung: Verhält sich Loxones Cloud-Tunnel auch mit 3 gleichzeitigen Sessions vom selben Server-Backend neutral?

## Umfang (klein halten)
- **Keine** Ablösung des bestehenden 15-Minuten-Polls. Der Poll bleibt als Sicherheitsnetz aktiv.
- **Neuer, paralleler Pfad** nur für die 2–3 Test-Tenants, per Feature-Flag aktivierbar.
- Kein UI-Umbau, keine Migration. Daten aus dem WS-Stream werden in dieselbe `loxone_*`-Tabellenstruktur geschrieben wie der Poller.

## Umsetzungsschritte

### 1. Feature-Flag & Tenant-Auswahl
- Neues Flag `loxone_remote_connect_ws_enabled` (boolean) in `loxone_integrations` oder `location_integrations`.
- Nur Tenants mit aktivem Flag bekommen den WS-Pfad. Default: `false`.

### 2. Persistenter WS-Worker (Edge Function ungeeignet)
- Edge Functions sind kurzlebig → ungeeignet für dauerhafte Sockets.
- Lösung: **Worker-Prozess auf dem Hetzner-Backend** (kein neuer Server, kein Gateway nötig).
- Aufgabe: Pro aktivem Test-Tenant eine `WebSocket`-Session zur Remote-Connect-URL halten, Token-Authentifizierung, Auto-Reconnect mit Backoff, Keepalive alle 60 s.

### 3. Auth-Flow Remote Connect
- Pro Tenant einmalig: Loxone-User + Passwort (verschlüsselt in `loxone_integrations`, AES-256-GCM wie bestehende Credentials).
- Worker macht den dokumentierten Token-Exchange (`jdev/sys/getkey2`, `getjwt`) und öffnet anschließend die WS.

### 4. Datenverarbeitung
- Eingehende Status-Events werden 1:1 in die existierende Normalisierung gesteckt (gleiche Funktion wie `loxone-periodic-sync` aufruft), Schreibpfad in DB unverändert.
- Kein Schema-Change nötig.

### 5. Monitoring (entscheidend für die Auswertung)
- Neue Tabelle `loxone_ws_session_log` (tenant_id, started_at, ended_at, disconnect_reason, events_received, reconnect_count).
- Super-Admin-Karte: pro Test-Tenant Uptime % der letzten 7 / 30 Tage, Anzahl Reconnects, letzte Disconnect-Ursache.
- Alarm bei > 3 Reconnects/h oder Session-Alter < 10 min im Schnitt.

### 6. Fallback
- Wenn WS-Session > 30 min nicht steht → automatisch zurück auf den 15-Min-Poll (der ohnehin weiter läuft, also passiv: einfach keinen WS-Stream erzwingen).
- Kein Datenverlust möglich, da Poll-Pfad parallel aktiv bleibt.

### 7. Auswertung nach 2–4 Wochen
- Uptime, Reconnect-Rate, Latenz Status-Änderung → DB-Sichtbarkeit
- Entscheidung: Roll-out, Verwerfen, oder ergänzend Reverse-Tunnel via Gateway prüfen.

## Was NICHT Teil des Tests ist
- Schreibender Zugriff (Steuerbefehle) über Remote Connect — erst nach erfolgreichem Lese-Test.
- Migration produktiver Tenants — passiert frühestens nach Auswertung.
- Abschaltung des Polls — bleibt bis auf Weiteres das Rückgrat.

## Technische Notizen
- Loxone Remote Connect arbeitet als Reverse-Tunnel der Miniserver zur Loxone-Cloud. Unsere WS verbindet sich gegen `dns.loxonecloud.com`, was intern an den jeweiligen Miniserver weitergeleitet wird.
- Verbindung muss tokenbasiert authentifiziert sein (`AES-256` Handshake + JWT). Bestehende Doku in `loxone-periodic-sync` als Referenz.
- Worker-Prozess: einfaches Node-Skript mit `ws`-Library, systemd-Service auf dem Hetzner-Host. Kein Kubernetes, kein Docker-Compose-Umbau.
- Keepalive: leeres `keepalive`-Command alle 60–120 s, um NAT/Loxone-Cloud-Timeouts zu vermeiden.

## Erfolgskriterien
- 99 %+ Uptime der WS-Session pro Test-Tenant über 14 Tage
- < 1 Reconnect / Tag im Schnitt
- Status-Änderungen am Miniserver in < 5 s im Backend sichtbar
- Keine zusätzlichen Lastprobleme auf Loxone-Cloud-Seite (keine HTTP 429 / Forced Disconnects)

Nur wenn alle vier Kriterien erfüllt sind, geht der Test in Phase 2 (breiterer Roll-out).
