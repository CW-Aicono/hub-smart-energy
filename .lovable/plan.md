
## Ziele

1. **1-Sekunden-Auflösung** über Loxone WebSocket (statt 30s HTTP-Polling)
2. **Intelligente Datenhaltung:** Sekundengenaue Rohwerte werden täglich in eine 5-Minuten-Verlaufskurve verdichtet und danach gelöscht
3. **Skalierbarkeit:** Klare Antwort wie viele Miniservers ein einziger Worker-Server abfragen kann

---

## Teil 1: Loxone WebSocket-Streaming

### Warum WebSocket statt weiterem HTTP-Polling

Der Miniserver unterstützt nativ ein **Event-Push-Protokoll über WebSocket** (`ws://ip/ws/rfc6455`). Das bedeutet: Der Server schickt aktiv Wertänderungen, sobald sie auftreten — der Worker muss nichts mehr fragen.

**Loxone WebSocket-Protokoll (aus der Dokumentation):**

```text
1. Verbindungsaufbau: ws://{ip}:{port}/ws/rfc6455
2. Auth:
   GET /jdev/sys/getkey → challenge (hex string)
   HMAC-SHA1(password, challenge) → hash
   GET /authenticate/{user}/{hash}
3. Status-Updates aktivieren:
   GET jdev/sps/enablestatusupdate
4. Miniserver sendet:
   - Beim Connect: alle aktuellen States (Header + ValueEvent-Binärframes)
   - Bei jeder Änderung: nur geänderte Werte (< 1s Latenz)
```

### Architektur im Gateway Worker

Statt 41 HTTP-Requests alle 30 Sekunden:
- **1 WebSocket-Verbindung pro Miniserver** (3 persistente Verbindungen für 3 Miniservers)
- Miniserver pusht Wertänderungen sofort bei Auftreten
- Worker pflegt einen **In-Memory-State** (`Map<sensor_uuid, latest_value>`)
- Ein **Flush-Timer** (konfigurierbar, z.B. `FLUSH_INTERVAL_MS=1000`) schreibt den aktuellen State einmal pro Sekunde als Batch in die DB

```text
Loxone MS #1 ──ws://──► Worker (UUID → value map)
Loxone MS #2 ──ws://──►                │
Loxone MS #3 ──ws://──►                │ (flush alle 1s)
                                        ▼
                              gateway-ingest (HTTP POST)
                                        │
                              meter_power_readings (DB)
                                        │
                              Supabase Realtime (WebSocket)
                                        │
                              Browser → UI aktualisiert < 1s nach Änderung
```

### Reconnect-Logik

Bei Verbindungsabbruch: exponentielles Backoff (1s → 2s → 4s → max 60s) + automatischer Reconnect. Während der Reconnect-Phase fällt der Worker **automatisch auf HTTP REST-Polling zurück** (bisheriges Verhalten), sodass es keine Datenlücken gibt.

### Neue Abhängigkeit

Das npm-Paket `ws` (WebSocket-Client für Node.js) wird in `docs/gateway-worker/package.json` hinzugefügt.

### Neue Umgebungsvariable

`FLUSH_INTERVAL_MS=1000` — wie oft der In-Memory-Buffer in die DB geschrieben wird.

---

## Teil 2: Intelligente Datenhaltung (Verdichtung + Cleanup)

### Das Problem

Bei 41 Metern und 1-Sekunden-Flush entstehen:
- **41 Rows/Sekunde → 3,5 Mio. Rows/Tag**
- Nach einer Woche: **25 Mio. Rows** — Kosten und Query-Performance leiden

### Die Lösung: Tagesverdichtung in 5-Minuten-Buckets

Am Ende jedes Tages (um 00:05 Uhr per pg_cron) wird eine neue Datenbanktabelle `meter_power_readings_5min` befüllt — mit dem **Durchschnittswert pro 5-Minuten-Fenster**. Danach werden die Rohdaten des Vortages gelöscht.

**Neue Tabelle: `meter_power_readings_5min`**

```sql
CREATE TABLE meter_power_readings_5min (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meter_id    uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  energy_type text NOT NULL,
  power_avg   numeric NOT NULL,   -- Durchschnitt im 5-Min-Fenster
  power_max   numeric NOT NULL,   -- Maximum im 5-Min-Fenster
  bucket      timestamptz NOT NULL, -- Beginn des 5-Min-Fensters
  sample_count integer NOT NULL   -- Anzahl Einzelwerte (Qualitätsindikator)
);
```

**Verdichtungslogik (SQL, läuft täglich):**

```sql
INSERT INTO meter_power_readings_5min (meter_id, tenant_id, energy_type, power_avg, power_max, bucket, sample_count)
SELECT
  meter_id,
  tenant_id,
  energy_type,
  avg(power_value)  AS power_avg,
  max(power_value)  AS power_max,
  date_trunc('hour', recorded_at) + 
    (floor(extract(minute FROM recorded_at) / 5) * interval '5 minutes') AS bucket,
  count(*)          AS sample_count
FROM meter_power_readings
WHERE recorded_at >= date_trunc('day', now() - interval '1 day')
  AND recorded_at <  date_trunc('day', now())
GROUP BY meter_id, tenant_id, energy_type, bucket;

-- Dann Rohdaten des Vortages löschen
DELETE FROM meter_power_readings
WHERE recorded_at < date_trunc('day', now());
```

**Ergebnis:** Statt 3,5 Mio. Roh-Rows/Tag entstehen nur noch **288 Rows/Meter/Tag** (12 × 24). Bei 41 Metern: **~11.800 Rows/Tag** in `meter_power_readings_5min`.

### Vorhandene Verlaufskurven im Frontend

Die Verlaufsdiagramme in `EnergyChart.tsx` lesen aktuell aus `meter_power_readings`. Sie werden auf `meter_power_readings_5min` umgestellt — damit bleibt die Kurve mit voller Qualität erhalten, die DB-Last sinkt drastisch.

### Datenfluss nach dem Umbau

```text
Heute (Rohdaten, 1s Auflösung):
  meter_power_readings     → LiveValues-Seite (Realtime, < 1s)
  
Gestern und älter (verdichtet, 5-Min Auflösung):
  meter_power_readings_5min → EnergyChart, Verlaufsdiagramme
  
Monatstotals / Jahrestotals (immer):
  meter_period_totals       → Summenwerte
```

---

## Teil 3: Skalierbarkeit — Wie viele Miniservers pro Server?

### Ressourcenverbrauch pro Miniserver-Verbindung

| Ressource | Pro Miniserver-WebSocket |
|---|---|
| RAM | ~2–5 MB (Verbindungs-Buffer + State-Map aller UUIDs) |
| CPU | < 1% idle (nur Event-Parsing bei Änderungen) |
| Netzwerk | ~5–20 kbit/s (bei aktiven Änderungen) |
| DB-Schreiblast | Wird durch Flush-Timer kontrolliert, unabhängig von Miniserver-Anzahl |

### Skalierungsrechnung

**Auf einem modernen Server (z.B. 4 CPU-Kerne, 8 GB RAM):**
- RAM-Limit bei 5 MB/Miniserver: **~1.000 Miniservers**
- CPU-Limit: De-facto irrelevant (WebSocket-Events sind nicht CPU-intensiv)
- Netzwerk-Limit bei 20 kbit/s: unkritisch bis weit über 1.000 Verbindungen
- **Reales Limit:** Wahrscheinlich die **DB-Schreibrate** (gateway-ingest HTTP-Calls)

**DB-Schreibrate bei 1-Sekunden-Flush:**
- 1 HTTP-POST/Sekunde mit N Readings
- Bei 500 Miniservers à 15 Metern = 7.500 Readings/POST → problemlos für Supabase
- Bei 1.000 Miniservers: möglicherweise auf 2–5s Flush erhöhen oder direkt DB-Verbindung (Service-Role-Key im Worker) verwenden

### Empfehlung für Produktions-Skalierung

```text
Stufe 1 (aktuell):    1 Worker-Instanz auf Raspberry Pi     → bis ~10 Miniservers
Stufe 2 (klein):      1 Worker auf VPS (2 CPU, 4 GB)        → bis ~200 Miniservers
Stufe 3 (mittel):     1 Worker auf Server (8 CPU, 16 GB)    → bis ~1.000 Miniservers
Stufe 4 (enterprise): Worker als Kubernetes-Deployment       → horizontal skalierbar
```

**Für echte Hochskalierung:**
Der Worker sollte mit einer `TENANT_FILTER`-Umgebungsvariable ausgestattet werden, die angibt welche Tenants dieser Instanz zugeordnet sind. Dann können mehrere Worker-Instanzen parallel betrieben werden — jede für eine Teilmenge der Kunden. Das ist mit minimalem Code-Aufwand umsetzbar.

---

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `docs/gateway-worker/index.ts` | Loxone WebSocket-Streaming + Flush-Buffer + HTTP-Polling-Fallback |
| `docs/gateway-worker/package.json` | `"ws": "^8.18.0"` + `"@types/ws": "^8.5.0"` hinzufügen |
| Neue Migration | Tabelle `meter_power_readings_5min` erstellen + pg_cron Job für Verdichtung + RLS |
| `supabase/functions/gateway-ingest/index.ts` | Tagesverdichtung als optionale Route (`?action=compact-day`) |

### Keine Änderungen nötig an:
- `src/pages/LiveValues.tsx` — Realtime-Subscription läuft weiterhin
- `supabase/functions/loxone-api/index.ts` — wird nicht mehr für Live-Werte benötigt

---

## Deployment nach Änderung

**Raspberry Pi (identische Schritte wie bisher):**

```bash
docker stop gateway-worker && docker rm gateway-worker
rm ~/gateway-worker/index.ts ~/gateway-worker/package.json
# Beide Dateien aus Lovable kopieren (nano)
cd ~/gateway-worker && npm install && docker build -t gateway-worker .
docker run -d --name gateway-worker --restart unless-stopped \
  -e SUPABASE_URL="https://xnveugycurplszevdxtw.supabase.co" \
  -e GATEWAY_API_KEY="sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp" \
  -e FLUSH_INTERVAL_MS=1000 \
  gateway-worker
```

**Erwartete Logs:**
```
[INFO] [Loxone] WebSocket connecting: 504F94D107EE → ws://195-201-222-243...
[INFO] [Loxone] WebSocket connected: 504F94D107EE (41 UUIDs registriert)
[INFO] [Loxone] Status updates enabled: 504F94D107EE
[INFO] ✓ Flush: 41 readings inserted (1003ms cycle)
[INFO] ✓ Flush: 41 readings inserted (1001ms cycle)
```

