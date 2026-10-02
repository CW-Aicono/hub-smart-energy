# AICONO EMS – OCPP Wallbox-Simulator (Hetzner-Container)

Eigenständiger Container, der **simulierte OCPP-1.6-Wallboxen** als WebSocket-Clients gegen den Zentralserver (`ocpp.aicono.org`) startet. Wird per HTTP-API ferngesteuert (in Iteration 3+ aus der Lovable-UI).

> Dies ist **Iteration 1**: nur Container + API. Tabelle `simulator_instances`, Edge Function und UI folgen in den nächsten Iterationen.

---

## Schritt-für-Schritt: Auf Hetzner deployen

> Du benötigst nur SSH-Zugriff auf den Hetzner-Server (so wie bei `ocpp-persistent-server`).

### 1. Code auf den Server holen

In deinem SSH-Fenster:

```bash
cd /opt/aicono/aicono-ems && git pull
```

### 2. `.env`-Datei anlegen

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-simulator-server
cp .env.example .env
nano .env
```

Im Editor:
- Bei **`SIMULATOR_API_KEY=`** den Wert einfügen, den du in Lovable als Secret `OCPP_SIMULATOR_API_KEY` gesetzt hast (genau derselbe String).
- Andere Werte kannst du lassen.
- Speichern: `Strg + O`, Enter, dann `Strg + X`.

### 3. Container bauen und starten

```bash
docker compose up -d --build
```

Das dauert ca. 1–2 Minuten beim ersten Mal.

### 4. Prüfen, ob er läuft

```bash
docker compose logs --tail=30 ocpp-simulator
```

Erwartete Ausgabe (Beispiel):
```
{"ts":"...","level":"info","msg":"OCPP Simulator API listening","port":8090,"maxPerTenant":3,"maxTotal":50}
```

### 5. Caddy-Reverse-Proxy ergänzen

Damit die API von außen unter `https://ocpp.aicono.org/sim-api/` erreichbar ist, brauchst du einen Eintrag in deiner Caddy-Konfiguration (gleiche Datei, in der `ocpp.aicono.org` schon konfiguriert ist).

Suche den Block für `ocpp.aicono.org` und ergänze **innerhalb** dieses Blocks (vor dem schließenden `}`):

```caddy
handle_path /sim-api/* {
    reverse_proxy 127.0.0.1:8090
}
```

Caddy neu laden:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

> Falls du Traefik statt Caddy nutzt, sag Bescheid – dann liefere ich die Traefik-Variante.

### 6. Testen mit `curl`

Ersetze `DEIN_API_KEY` durch den gespeicherten Schlüssel:

```bash
# Status (sollte leere Liste liefern)
curl -H "Authorization: Bearer DEIN_API_KEY" \
     https://ocpp.aicono.org/sim-api/status

# Simulator starten (Beispiel-Tenant + Beispiel-OCPP-ID)
curl -X POST \
     -H "Authorization: Bearer DEIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"test-tenant","ocppId":"sim-test-01","protocol":"wss"}' \
     https://ocpp.aicono.org/sim-api/start
```

Wenn alles klappt, antwortet der Server mit einem JSON-Objekt, in dem `status` zunächst `connecting` und kurz darauf `online` steht.

Parallel kannst du im Logs des **OCPP-Servers** sehen, dass die Verbindung ankommt:
```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
docker compose logs --tail=20 ocpp
```

> **Hinweis:** Solange wir noch nicht in Iteration 2 sind, kennt der OCPP-Server diese ocpp-id nicht und meldet „Unknown charge point". Das ist erwartet – wir lösen das in Schritt 2 (DB-Tabelle + automatisches Anlegen eines Charge Points).

### 7. Stoppen

```bash
curl -X POST \
     -H "Authorization: Bearer DEIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"id":"<id-aus-start-response>"}' \
     https://ocpp.aicono.org/sim-api/stop
```

---

## API-Übersicht (intern, später durch Edge Function gerufen)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET  | `/sim-api/status?tenantId=...` | Aktive Instanzen (optional pro Tenant) |
| POST | `/sim-api/start` | Neue Simulator-Instanz starten |
| POST | `/sim-api/action` | `startTx` / `stopTx` manuell triggern |
| POST | `/sim-api/stop` | Instanz stoppen |
| GET  | `/health` | Healthcheck (ohne Auth) |

Alle Endpunkte (außer `/health`) erfordern den Header `Authorization: Bearer <SIMULATOR_API_KEY>`.

---

## Sicherheit

- Container lauscht **ausschließlich auf 127.0.0.1**. Öffentlich erreichbar nur über Caddy-Reverse-Proxy.
- Bearer-Token-Schutz auf jeder API-Anfrage.
- Hartes Limit: 3 Instanzen pro Tenant, 50 insgesamt (in `.env` anpassbar).
