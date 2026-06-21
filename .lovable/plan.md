## Aktueller Befund (Last der letzten ~24 h, seit Postgres-Neustart 2026-06-20 08:05 UTC)

**Die RLS-Migration war NICHT die Ursache** – sie hat geholfen, aber der echte IO-Fresser ist eine andere Query.

### Schreib-Last (24 h) – unauffällig
- `meter_power_readings`: nur **18.329 INSERTs** in 24 h (~12/Min). Sehr wenig.
- `meter_period_totals`: 71.575 UPDATEs.
- `location_integrations`: 9.809 UPDATEs.

### Lese-Last (24 h) – DAS ist der IO-Killer
`pg_stat_statements` zeigt eine einzige Query, die fast alle Disk-Reads verursacht:

```sql
SELECT id FROM meter_power_readings WHERE created_at >= $1 LIMIT $2 OFFSET $3
-- + paralleler COUNT(*) auf identischen Filter
```
- **768 Aufrufe**, Mittelwert **2.321 ms** pro Aufruf
- **2.963.467 Disk-Blocks gelesen** (~23 GB von Platte) – nur durch diese eine Query
- Insgesamt **1.563 Sequential-Scans × 525 Mio. Zeilen** auf `meter_power_readings`

### Quelle der Query – eindeutig identifiziert
Edge-Function **`gateway-worker-status`** (Zeile 60–65) macht:
```ts
.from("meter_power_readings")
.select("id", { count: "exact", head: true })
.gte("created_at", fiveMinAgo);
```
- Filter auf `created_at` – darauf gibt es **keinen Index** → Full Table Scan
- `count: "exact"` zwingt Postgres jedes Mal die komplette gefilterte Menge zu zählen
- Aufgerufen von `GatewayWorkerStatusCard.tsx` mit `refetchInterval: 15_000` → alle 15 s, sobald irgendwer den Super-Admin-Bereich offen hat

→ Jeder Aufruf liest ~23 GB von Platte. Das passt exakt zu 74 % IO-Budget.

---

## Fix-Plan (2 kleine Änderungen, keine Frontend-Logik-Änderung)

### Schritt 1 – Migration: BRIN-Index auf `meter_power_readings.created_at`
BRIN ist ideal für Zeitreihen (winzig, ~80 KB statt mehrerer GB B-Tree). Damit wird der Filter `created_at >= now() - 5min` in Millisekunden beantwortet statt Vollscan.

```sql
CREATE INDEX IF NOT EXISTS idx_meter_power_readings_created_at_brin
  ON public.meter_power_readings
  USING BRIN (created_at) WITH (pages_per_range = 32);
```

### Schritt 2 – Edge-Function `gateway-worker-status` anpassen
`count: "exact"` durch `count: "estimated"` ersetzen (für die Anzeige reicht eine Schätzung; der echte Wert braucht den Vollscan nicht).

```ts
.select("id", { count: "estimated", head: true })
```

### Schritt 3 – Polling-Intervall der Karte erhöhen
`refetchInterval: 15_000` → **60_000** (1 × pro Minute statt 4 ×). Genügt für ein Worker-Heartbeat-Display vollkommen.

---

## Erwartung
- IO-Budget sollte innerhalb von 30–60 Min nach Deploy deutlich fallen (Ziel < 30 %).
- Falls nicht: Verifizieren durch erneutes `pg_stat_statements`-Snapshot – die genannte Query darf nicht mehr unter den Top-Disk-Reads stehen.

## Was wir NICHT tun
- Kein Instance-Upgrade kaufen, bevor diese eine Query gefixt ist.
- Keine RLS weiter umbauen (die letzte Migration war korrekt, aber nicht der Hebel).
- Keine Cron-Jobs deaktivieren.
