# Loxone WS Worker – Anleitung (Feldtest Remote Connect)

## Was macht dieser Worker?

Dieser Mini-Dienst läuft auf eurem Hetzner-Server (ein Docker-Container) und baut
**eine dauerhafte WebSocket-Verbindung** zu jedem Loxone-Miniserver auf, der im
Backend für den Feldtest freigeschaltet wurde (Feature-Flag
`loxone_remote_connect_ws_enabled = TRUE`).

Verbunden wird über **Loxone Remote Connect** (`dns.loxonecloud.com/<Seriennummer>`)
— es ist also **kein** AICONO-EMS-Gateway vor Ort nötig.

**Wichtig:** Der Worker ersetzt nichts. Das stündliche Edge-Function-Polling läuft
parallel weiter als Sicherheitsnetz. Wenn der Test erfolgreich ist, können wir es
in Phase 2 reduzieren.

---

## Voraussetzungen

- Hetzner-Server mit Docker (gleicher Host, auf dem auch der alte
  `gateway-worker` lief — er ist hier ersetzt)
- Den Wert von `GATEWAY_API_KEY` (gleicher Bearer-Token wie bei `gateway-ingest`)
- Mindestens ein Standort im Backend, bei dem die Loxone-Integration
  `loxone_remote_connect_ws_enabled = TRUE` gesetzt hat
- Bei jedem Test-Standort müssen in der Integration **Seriennummer, Benutzername
  und Passwort** des Miniservers korrekt hinterlegt sein

---

## Schritt-für-Schritt: Erstinstallation

### 1. Dateien auf den Hetzner-Server kopieren

Per SCP oder Git-Pull alle vier Dateien aus `docs/loxone-ws-worker/` auf den
Server kopieren, z. B. nach `/opt/loxone-ws-worker/`:

```
/opt/loxone-ws-worker/
├── Dockerfile
├── index.ts
├── package.json
└── tsconfig.json
```

### 2. Docker-Image bauen

Im Verzeichnis `/opt/loxone-ws-worker/`:

```bash
docker build -t loxone-ws-worker .
```

Dauert beim ersten Mal ca. 1–2 Minuten (npm install + TypeScript-Build).

### 3. Container starten

```bash
docker run -d --restart=always --name loxone-ws-worker \
  -e SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co \
  -e GATEWAY_API_KEY=DEIN_API_KEY \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  loxone-ws-worker
```

> `WORKER_HOST` taucht im Session-Log auf — frei wählbar, hilft beim späteren
> Auswerten, wenn mehrere Worker laufen.

### 4. Logs prüfen

```bash
docker logs -f loxone-ws-worker
```

Erwartet:

```
[INFO] Loxone WS Worker (Feldtest) startet — host=hetzner-prod-1
[INFO] [Reload] aktive Miniserver: 2
[INFO] [DNS] 504F94AB1234 → 504f94ab1234.dns.loxonecloud.com
[INFO] [WS] verbinde 504F94AB1234 → 504f94ab1234.dns.loxonecloud.com
[INFO] [WS] authentifiziert 504F94AB1234 (5 UUIDs)
```

Sind 0 aktive Miniserver zu sehen → noch keine Integration hat das Feature-Flag
gesetzt. Das wird per SQL gemacht (siehe unten).

---

## Test-Tenant freischalten (SQL)

Im Backend (Super-Admin → SQL-Editor) für 2–3 Test-Standorte aktivieren:

```sql
UPDATE location_integrations
SET loxone_remote_connect_ws_enabled = TRUE
WHERE id IN ('<integration-id-1>', '<integration-id-2>');
```

Innerhalb von max. 5 Minuten lädt der Worker die Liste neu und verbindet sich.

Wieder deaktivieren:

```sql
UPDATE location_integrations
SET loxone_remote_connect_ws_enabled = FALSE
WHERE id = '<integration-id>';
```

---

## Monitoring

Alle Verbindungs-Events landen in der Tabelle `loxone_ws_session_log`:

| Spalte               | Bedeutung                                            |
|----------------------|------------------------------------------------------|
| `started_at`         | Wann die WS-Verbindung aufgebaut wurde               |
| `ended_at`           | Wann sie geschlossen wurde (NULL = noch aktiv)       |
| `disconnect_reason`  | `close-1006`, `connect-error: ...`, `shutdown-...`   |
| `events_received`    | Wie viele Wert-Events während der Session ankamen    |
| `reconnect_count`    | Reconnect-Versuche dieser Verbindung                 |
| `worker_host`        | Welcher Worker das Log geschrieben hat               |

Auswertung-Beispiel (durchschnittliche Session-Länge pro Standort):

```sql
SELECT location_integration_id,
       COUNT(*)                                                AS sessions,
       AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))/60     AS avg_min,
       SUM(reconnect_count)                                    AS total_reconnects
FROM loxone_ws_session_log
WHERE started_at > now() - interval '14 days'
  AND ended_at IS NOT NULL
GROUP BY location_integration_id;
```

Ein **Super-Admin-Dashboard** kommt in Schritt 3 (separat).

---

## Container neu starten / stoppen

```bash
docker restart loxone-ws-worker     # Neustart
docker stop    loxone-ws-worker     # Stop
docker rm  -f  loxone-ws-worker     # Löschen
```

Nach Code-Änderungen: Image neu bauen (`docker build -t loxone-ws-worker .`)
und Container neu starten.

---

## Wichtig: was dieser Worker NICHT macht

- Kein HTTP-Polling für andere Gateways (Shelly/Tuya/… → läuft weiter über die
  Edge Functions)
- Kein OCPP-Proxy
- Kein Schreiben von Befehlen an Loxone (nur Read)
- Keine Produktiv-Tenants — nur Standorte mit gesetztem Feature-Flag

Der alte `docs/_DEPRECATED_gateway-worker/` bleibt als historische Referenz
liegen, wird aber nicht mehr deployed.
