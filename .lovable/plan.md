## Zu deinen zwei Fragen

### 1) „267s" vs. „vor 8 Minuten" – was bedeutet was?

Beide Angaben sollen dasselbe zeigen (Alter des letzten Heartbeats), stammen aber aus **zwei unterschiedlichen Berechnungen**, die auseinanderlaufen:

- **`267s (Schwelle 900s)`** – vom Server (Edge Function `gateway-worker-status`) beim letzten Fetch berechnet: `now() − last_heartbeat_at` in Sekunden. Aktualisiert sich nur alle 60 s (React-Query-Refetch).
- **„vor 8 Minuten"** – im Browser via `formatDistanceToNow(last_heartbeat)` bei jedem Re-Render neu formatiert, gegen die **Client-Uhr**.

Zwischen zwei Refetches rendert React die Karte mehrfach (z. B. weil andere Queries laufen). Dann bleibt der Server-Wert `267s` stehen, während der Client-Text `vor X Minuten` weiterläuft. Ergebnis: beide zeigen das gleiche Feld, aber gefühlt „unterschiedliche" Zeiten.

**Zusatz-Verwirrung möglich:** Wenn Client- und Server-Uhr um ein paar Minuten abweichen, driftet das dauerhaft.

**Aktueller DB-Stand** (gerade abgefragt): `last_heartbeat_at` war 25 s alt – der Worker heartbeatet also normal.

### 2) Kommen die Werte jetzt ausschließlich über den WS-Worker?

**Sehr wahrscheinlich ja, aber nicht 100 % beweisbar aus der DB allein**, weil `meter_power_readings` keine Quellen-Spalte hat (Worker vs. `loxone-api` schreiben in dieselbe Tabelle).

Indizien, die dafür sprechen:
- **Insert-Muster der letzten 20 Min:** gleichmäßig jede Minute (alternierend 44/70 Rows). Passt zum Worker-Aggregations-Flush. Kein sichtbarer 15-Min-Spike, den ein zusätzlicher HTTP-Pull erzeugen würde.
- **Flag + Heartbeat:** `worker_active=true` und Heartbeat frisch (25 s < 900 s Schwelle) → `isWorkerPrimary()` in `loxone-api` liefert `true` → HTTP-Schreibpfad wird übersprungen.

Um es sauber zu bestätigen, will ich zwei kurze Checks machen:
- Edge-Function-Logs von `loxone-api` der letzten 20 Min auf „skipped (worker primary)" prüfen.
- Optional temporär eine `source`-Spalte oder ein Log-Marker, damit man Worker- vs. HTTP-Inserts dauerhaft unterscheiden kann (nicht Teil dieses Plans, nur Vorschlag).

## Plan: Anzeige konsistent machen

Nur UI-Fix, keine Backend-Änderung.

**Datei:** `src/components/super-admin/GatewayWorkerStatusCard.tsx`

- „Letzter Heartbeat"-Label nicht mehr per `formatDistanceToNow(last_heartbeat)` aus der Client-Uhr rechnen, sondern **aus `heartbeat_age_seconds` des Servers** ableiten (`vor Xs` / `vor X Min` / `vor X Std`). So kann es keinen Drift zwischen den beiden Angaben mehr geben.
- Detailzeile bleibt: `Xs (Schwelle 900s)`.
- Fallback: wenn `heartbeat_age_seconds` `null` ist → „noch nie".

**Verifikation nach der Umsetzung:**
1. Karte im Super-Admin neu laden → beide Werte identisch.
2. 90 s warten (ohne Refetch) → beide Werte bleiben stabil, springen dann gemeinsam beim nächsten Fetch.
3. Edge-Log `loxone-api` prüfen: Meldungen „skipped, worker primary" vorhanden → belegt Exklusivität.

## Nicht Teil dieses Plans

- Kein Umbau an Worker, Stale-Schwelle oder `loxone-api`.
- Keine neue DB-Spalte „source" (kann ich separat vorschlagen, wenn du dauerhafte Nachweisbarkeit willst).
