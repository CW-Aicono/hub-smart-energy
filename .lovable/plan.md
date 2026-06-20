

# Fix: TypeScript-Build-Fehler im Loxone-Worker

## Was ist passiert?

Beim Build im Container ist genau ein Fehler aufgetreten:

```
index.ts(548,26): error TS2339: Property 'enabled' does not exist on type 'unknown'.
```

**Übersetzt:** Die Antwort von `fetch(...).json()` ist für TypeScript erstmal vom Typ „unbekannt". Wir müssen ihm sagen, dass darin ein Feld `enabled` steckt. Eine einzige Zeile ändern, fertig.

**Wichtig zu deinem `docker run` danach:** Der zweite Befehl in deinem Putty-Log hat *zwar* einen Container gestartet — aber mit dem Image-Tag `loxone-ws-worker:phase6.1`, also dem **alten Image** von vorher. Der Build war ja fehlgeschlagen, das neue Image existiert noch gar nicht. Der laufende Container hat daher **immer noch keine Killswitch-Logik**. Das erklärt, warum im Monitor weiter Heartbeats kommen.

---

## Was ich in Lovable ändere (1 Zeile)

Datei: `docs/loxone-ws-worker/index.ts`, Zeile 547–548

**Vorher:**
```ts
const body = await r.json();
const enabled = body.enabled !== false;
```

**Nachher:**
```ts
const body = await r.json() as { enabled?: boolean };
const enabled = body.enabled !== false;
```

Sonst nichts. Keine weiteren Code- oder DB-Änderungen.

---

## Was du danach auf Hetzner machst (exakte Copy-Paste-Blöcke)

### Schritt 1 — In Putty einloggen und ins Worker-Verzeichnis

```bash
cd /opt/loxone-ws-worker
```

→ Erwartetes Ergebnis: Prompt zeigt `/opt/loxone-ws-worker`.

### Schritt 2 — Neuen Code holen

```bash
git pull
```

→ Erwartetes Ergebnis: Meldung `Updating ...` mit `index.ts` in der Dateiliste.
**Wenn „Already up to date." kommt:** STOPP, sag mir Bescheid (dann ist der Lovable-Code noch nicht im GitHub-Repo angekommen — siehe deine Memory-Regel „Publish → Hard Reload → manuell committen").

### Schritt 3 — Prüfen, dass der Fix wirklich drin ist

```bash
grep -n "as { enabled" index.ts
```

→ Erwartetes Ergebnis: **Genau eine Zeile** wird ausgegeben, etwa:
```
547:    const body = await r.json() as { enabled?: boolean };
```
**Wenn nichts ausgegeben wird:** STOPP, nicht weitermachen.

### Schritt 4 — Alten Container stoppen und löschen

```bash
docker stop loxone-ws-worker
docker rm loxone-ws-worker
```

→ Erwartetes Ergebnis: Zwei Zeilen mit dem Namen `loxone-ws-worker`. (Falls „No such container": ignorieren, dann ist er schon weg.)

### Schritt 5 — Image neu bauen (mit neuem Tag)

```bash
docker build -t loxone-ws-worker:phase7 .
```

→ Erwartetes Ergebnis: Am Ende `Successfully tagged loxone-ws-worker:phase7` (oder `naming to docker.io/library/loxone-ws-worker:phase7 done`). **Kein** TS2339-Fehler mehr.

**Wenn doch ein Fehler kommt:** STOPP, schick mir die letzten 20 Zeilen der Ausgabe.

### Schritt 6 — Container mit dem NEUEN Image starten

Genau dein bisheriger `docker run`-Befehl, aber mit `:phase7` statt `:phase6.1`:

```bash
docker run -d --restart=always --name loxone-ws-worker \
  -p 8080:8080 \
  -e SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co \
  -e GATEWAY_API_KEY=sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e WORKER_NAME=hetzner-bridge-test \
  -e FLUSH_INTERVAL_MS=1000 \
  -e RELOAD_INTERVAL_MS=300000 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
  -e BRIDGE_HEARTBEAT_MS=300000 \
  -e HEALTH_PORT=8080 \
  loxone-ws-worker:phase7
```

→ Erwartetes Ergebnis: Eine lange Hex-Zeichenkette (Container-ID).

### Schritt 7 — Killswitch-Beweis-Test

```bash
docker logs --tail 30 loxone-ws-worker
```

→ Erwartetes Ergebnis: Logzeilen aus den letzten Sekunden, **u. a. eine Zeile mit `[Killswitch]`** (z. B. beim Start, weil `pollKillswitch()` sofort einmal läuft). Außerdem WS-Verbindungen zu den 3 Miniservern.

Dann im UI: **Super-Admin → Worker-Steuerung → `loxone_ws_worker` auf Pausiert**, 60 s warten, nochmal:

```bash
docker logs --tail 20 loxone-ws-worker
```

→ Erwartetes Ergebnis: Zeile `[Killswitch] Worker wurde im Admin-Dashboard PAUSIERT. Trenne alle WS-Verbindungen.`
Im **WebSocket-Monitor** zeigen die 3 Miniserver **Inaktiv**, keine neuen Heartbeats mehr.

### Schritt 8 — Wieder einschalten

Im UI Toggle zurück auf **Aktiv**. Innerhalb 60 s sollten WS-Verbindungen wieder stehen, im Log: `[Killswitch] Worker wurde im Admin-Dashboard AKTIVIERT.`

---

## Hard-Stop-Regel

Wenn Schritt 5 erneut mit einem TypeScript-Fehler abbricht, oder Schritt 7 keine `[Killswitch]`-Zeile zeigt: **STOPP nach dem 2. Versuch**, Logs schicken, ich entscheide ehrlich, ob der Weg geht. Nicht raten.
