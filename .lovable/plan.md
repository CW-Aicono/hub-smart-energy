# Plan: Hetzner-Monitoring (a) + Loxone-Bulk-Optimierung (b)

Beide Teile sind **unabhängig voneinander** und können einzeln freigegeben/zurückgerollt werden. Risiko wird durch Feature-Flags, Read-only-Erstauslieferung und parallelen Betrieb minimiert.

---

## Teil A — Hetzner-Node-Monitoring (read-only, kein Risiko)

**Ziel:** Im Super-Admin-Bereich live sehen, wie stark die Hetzner-Worker- und DB-Nodes ausgelastet sind (CPU, RAM, Disk, Last-Heartbeat), damit du frühzeitig erkennst, wann ein Upgrade nötig ist.

### Architektur

```text
Hetzner-Node (Worker, DB, OCPP)
  └─ node-metrics-reporter  (kleines Bash-Cron-Skript, alle 60 s)
       └─ POST /functions/v1/ingest-node-metrics
              └─ Tabelle: public.node_metrics (append-only)
                   └─ Super-Admin-Page: /super-admin/monitoring → neue Card "Hetzner-Nodes"
```

### Datenfluss

1. **Neue Tabelle** `public.node_metrics` (append-only, append + 7 Tage Retention via pg_cron):
  - `node_name` (z. B. `gateway-worker-1`, `ocpp-server`, `k8s-control-1`)
  - `cpu_percent`, `mem_percent`, `disk_percent`, `load_avg_1m`, `uptime_seconds`
  - `recorded_at`
  - RLS: nur `super_admin` darf lesen, nur Service-Role schreibt.
2. **Neue Edge Function** `ingest-node-metrics` (POST):
  - Auth über neuen Secret `NODE_METRICS_TOKEN` (Bearer-Header).
  - Validiert Payload mit Zod, schreibt eine Zeile in `node_metrics`.
  - Antwort `{ ok: true }`.
3. **Bash-Reporter** `docs/node-metrics-reporter/report.sh` (zum manuellen Deploy auf jeden Hetzner-Server):
  - Liest `/proc/stat`, `/proc/meminfo`, `df`, `uptime`.
  - Schickt JSON an die Edge Function alle 60 s via cron.
  - Plus Mini-Anleitung `INSTALL.md` (laienverständlich, copy-paste-Block).
4. **Super-Admin-UI** — neue Card im bestehenden `SuperAdminMonitoring.tsx`:
  - Komponente `HetznerNodesCard.tsx` (analog zum bestehenden `GatewayWorkerStatusCard`).
  - Zeigt pro Node: aktueller CPU/RAM/Disk-Wert + Badge (grün <60 %, gelb 60–80 %, rot >80 %), letzter Heartbeat als „vor X Sekunden".
  - Refetch alle 15 s, keine Realtime-Subscription (spart Last).
  - Zahlen mit `toLocaleString("de-DE")`.

### Risiko & Rollback

- **Risiko: minimal.** Reine Lesefunktion, kein Eingriff in produktive Pfade. Wenn der Reporter ausfällt, sieht der Super-Admin nur „kein Heartbeat" — sonst keine Auswirkung.
- **Rollback:** Edge Function deaktivieren oder Cron-Job auf dem Server stoppen (`crontab -e` → Zeile löschen).
- Du musst nichts an bestehenden Hetzner-Services anfassen — der Reporter ist additiv.

### Aufwand

~1 Migration, 1 Edge Function, 1 React-Card, 1 Bash-Skript + Mini-Anleitung. Ein Loop.

---

## Teil B — Loxone-Bulk-Endpoint (90 % Traffic-Reduktion)

**Ziel:** Statt pro Sensor einen HTTPS-Call (`/jdev/sps/io/<uuid>/all`), nur **noch einen Call pro Miniserver pro Sync** (`/jdev/sps/io/_/all`), der alle Werte in einem JSON liefert.

### Was geändert wird (nur Edge Function `loxone-api`)

1. **Neuer Modus** `getAllStates` in `loxone-api/index.ts`:
  - Ein Request an `/jdev/sps/io/_/all` → liefert Map `{ uuid: value }` für **alle** Controls des Miniservers.
  - Antwort wird in einem In-Memory-Cache (60 s TTL) pro Miniserver gehalten.
2. `**loxone-periodic-sync` umstellen:**
  - Statt N parallele `getControlState`-Calls → **einmal** `getAllStates` pro Miniserver, dann lokal die UUIDs aus der Map ziehen.
  - Schreibpfad in `meter_power_readings_5min` bleibt **byte-identisch** (gleiches Insert, gleiche Aggregation).
3. **Feature-Flag in `system_settings`:**
  - Neuer Key `loxone_bulk_mode` (default `false`).
  - In `loxone-periodic-sync` zu Beginn lesen:
    - `false` → alter Pfad (heutiges Verhalten, unverändert).
    - `true`  → Bulk-Pfad.
  - So kannst du pro Umgebung (Lovable Cloud vs. Hetzner) **getrennt** umschalten und bei Problemen mit einem SQL-Update sofort zurück.
4. **Schatten-/Vergleichsmodus für 24 h** (optional, aber empfohlen):
  - Wert `loxone_bulk_mode = 'shadow'` → Bulk-Call wird zusätzlich gemacht, Ergebnis nur geloggt + mit Einzel-Calls verglichen (Differenzen in `integration_errors` als Info).
  - Schreibpfad nutzt weiterhin die Einzel-Calls. So sehen wir, ob die Bulk-Antwort 1:1 passt, **bevor** wir umschalten.

### Risiko & Rollback

- **Risiko: niedrig**, weil:
  - Alter Pfad bleibt im Code, wird per Flag gewählt.
  - Schatten-Modus erlaubt 1:1-Vergleich ohne Produktionsdaten zu ändern.
  - Rollback = ein UPDATE auf `system_settings`, sofort wirksam beim nächsten Cron-Tick (≤ 60 s).
- **Was wir NICHT anfassen:** Aggregations-Logik, Schreibpfad in `meter_power_readings_5min`, Stundenaggregate, Frontend-Widgets, Hetzner-Worker (der hat einen eigenen Codepfad und bleibt unverändert).

### Erwarteter Effekt

- **Loxone-Traffic:** ca. **−90 %** (von ~130 Requests/Min auf 1 pro Miniserver).
- **Edge-Function-Calls (loxone-api):** ebenfalls −90 % → spürbare Entlastung der Lovable-Cloud-Funktion und der Hetzner-Worker-CPU.
- **Datenqualität:** identisch (gleicher Loxone-Endpoint, nur gebündelt).

### Aufwand

Eine Edge-Function-Erweiterung + Anpassung von `loxone-periodic-sync` + 1 Migration für `system_settings`-Default. Ein Loop.

---

## Empfohlene Reihenfolge

1. **Erst Teil A bauen** (Monitoring sichtbar machen) — so siehst du beim Roll-out von Teil B sofort am CPU-Graph, ob die Bulk-Umstellung wirkt.
2. **Dann Teil B** im Schatten-Modus aktivieren (1–2 Tage Vergleich).
3. **Bulk-Modus scharfschalten**, CPU-Graphen im neuen Monitoring beobachten.

---

## Was offen ist (entscheidest du)

- **Teil A:** Sollen auch **Datenbank-Metriken von Lovable Cloud** (Postgres CPU/Verbindungen) in dieselbe Card? → würde den Plan um ein zweites Edge-Function-Endpunkt erweitern (nutzt `supabase--db_health`). Empfehlung: **separat als Folge-Task**, um diesen Plan klein zu halten.
- **Teil B:** Soll der Schatten-Modus **automatisch nach 24 h** in den echten Modus wechseln, oder bleibt es ein manuelles Umschalten? Empfehlung: **manuell** (du behältst die Kontrolle).

Wenn du den Plan freigibst, baue ich **Teil A zuerst** und melde mich vor Teil B nochmal.  
  
Antworten:  
- Teil A: Ja, auch Datenbank_Metriken aus der Cloud mit integrieren.  
- Teil B: Ja, manuelles Umschalten hier über den Chat.