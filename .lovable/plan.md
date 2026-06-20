## Befund (mit echten DB-Zahlen, keine Vermutung)

Aus der Datenbank-Statistik seit dem letzten Neustart kommen die IO-Spitzen **nicht** von normalen Messdaten, sondern von **technischen Schreibvorgängen, die viel zu oft passieren**:

| Tabelle | Inserts | Updates | Bewertung |
|---|---|---|---|
| `location_integrations` (nur 11 Zeilen!) | 0 | **7.781** | Wird bei jedem Sensor-Push aktualisiert |
| `bridge_event_log` | **31.718** | 0 | Jeder Reconnect/Subscribe schreibt 5–7 Log-Zeilen |
| `loxone_ws_session_log` | 7.867 | 15.120 | Rathaus: **927 Sessions / 24 h** (alle ~1,5 min neu) |
| `bridge_raw_samples` | 13.674 | **13.630** | Jede Zeile wird einmal Insert + einmal Update geschrieben |
| `bridge_miniserver_links` (3 Zeilen!) | 0 | **3.972** | Heartbeat alle 30 s |
| `bridge_workers` (1 Zeile!) | 0 | 1.345 | Worker-Heartbeat alle 30 s |
| `meter_period_totals` | 252 | **23.267** | Cron `refresh-meter-period-totals-5min` |

Top-Slow-Query (kumuliert): **2,33 Mio. Updates auf `location_integrations.last_sync_at`** und **5,13 Mio. Inserts in `meter_power_readings`** — beides ist die historische Last; die laufende Rate ist jetzt moderat (~7 Inserts/min), aber jeder einzelne Push triggert sofort ein `last_sync_at`-Update.

**Konsequenz:** Die WS-Reconnect-Schleife (Rathaus alle ~1,5 min) erzeugt nicht durch die Daten, sondern durch die **Begleit-Schreibvorgänge** (Session-Log + Event-Log + per-UUID-Subscribe-Logs) den Großteil der IO.

## Plan: 5 gezielte Code-Änderungen

### 1. `location_integrations.last_sync_at` nicht mehr bei jedem Push schreiben *(größte Wirkung)*
In `supabase/functions/gateway-ingest/index.ts`: Update auf `last_sync_at` **drosseln** auf maximal 1× pro Minute pro Integration (In-Memory-Cache pro Function-Instanz mit `Map<id, lastWrittenMs>`).
→ erwartete Reduktion: ~95 % weniger Updates auf dieser Tabelle.

### 2. `bridge_event_log` entrümpeln
In `docs/loxone-ws-worker/index.ts`: `bridgeLog(...)` nur noch bei **`warn`/`error`** in die DB schreiben. Alle `info`-Events (`ws_connected`, `ws_reconnect_scheduled`, `ws_per_uuid_subscribed` etc.) nur noch lokal in Konsole loggen.
→ erwartete Reduktion: ~80 % weniger Event-Log-Inserts.

### 3. Worker- und Miniserver-Heartbeats von 30 s → 5 min
Im Worker:
- `BRIDGE_HEARTBEAT_MS` Default `30000` → `300000` (5 min)
- Session-Heartbeat (Zeile 634, hartcodiert `15000` ms) → `60000` ms (1 min)

→ Faktor 4–10 weniger Updates auf `bridge_workers`, `bridge_miniserver_links`, `loxone_ws_session_log`.

### 4. Keepalive auf 2 min hoch, Watchdog-Schwelle auf 10 min
`KEEPALIVE_INTERVAL_MS` Default `60000` → `120000`, `WATCHDOG_STALE_MS` Default `300000` → `600000`.
Hintergrund: Loxone schließt aktive Sessions häufig mit `code=2003` selbst (Token/NAT). Häufige Keepalives provozieren das eher als sie es zu verhindern. Längere Toleranz reduziert Reconnect-Stürme.

### 5. `loxone_ws_session_log`: Reconnects unter 60 s nicht als neue Session zählen
In `sessionStart`/`sessionEnd`: Wenn die letzte Session derselben Verbindung **< 60 s alt** war, dieselbe `session_id` wiederverwenden und nur einen Update statt Insert+Insert+Update schreiben.
→ Rathaus von ~927 auf ~30 Sessions/24 h.

## Was wir bewusst NICHT tun

- **Keine Migration / kein Schema-Change.** Reine App-Logik-Anpassung.
- **Kein Cron-Job-Eingriff** (`refresh-meter-period-totals-5min` etc.) — die laufen außerhalb des IO-Spitzenfensters.
- **Keine spekulativen Refactors** am Polling-Pfad (`loxone-periodic-sync`).
- Cloud-Instanz wird **nicht** upgegradet — wir fixen erst den Verursacher.

## Reihenfolge & Deployment

1. Edge-Function `gateway-ingest` patchen → automatisch deployt durch Lovable Cloud.
2. Worker-Code `docs/loxone-ws-worker/index.ts` patchen.
3. Du kopierst per PuTTY die neue `index.ts` nach `/opt/loxone-ws-worker/index.ts` (Step-by-Step bekommst du im Build-Schritt).
4. `docker build` + `docker rm -f` + `docker run` (fertiger Copy-Paste-Block).
5. Nach ~20 min IO-Budget in der Cloud-Übersicht prüfen.

## Erwartetes Ergebnis

DB-Schreiblast in Summe etwa **um den Faktor 8–12 niedriger**. IO-Budget sollte von 100 % auf < 30 % fallen, ohne dass eine einzige Messung verloren geht.
