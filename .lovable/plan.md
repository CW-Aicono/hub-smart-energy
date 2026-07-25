## Status WS-Worker & IO-Budget (Test-Cloud, Stand jetzt)

### 1) Kommen die Werte ausschließlich über den WS-Worker?

**Nein — es schreiben weiterhin beide Pfade parallel.**

Blick in `meter_power_readings_5min`, letzte 90 Min, gruppiert nach `source`:

```text
Bucket               bridge_ws   loxone_pull
21:20                    –          19
21:15                    5          53
21:10                    7          19
21:05                    3          19
21:00                    8          47
20:55                    6          19
20:50                    6          19
20:45                    5          57   ← 15-Min-Pull-Zyklus
20:40                    7          19
20:35                    3          19
20:30                    5          57   ← 15-Min-Pull-Zyklus
...
```

Muster:
- `loxone_pull` schreibt konstant ~19 Zeilen alle 5 Min plus einen Burst (~50) alle 15 Min → HTTP-Pull ist voll aktiv, nicht durch den Worker verdrängt.
- `bridge_ws` schreibt 3–8 aggregierte Buckets/5 Min → Worker-Aggregations-Flush läuft, deckt aber nur einen Teil der Meter ab.

Worker-Heartbeat: **frisch** (`hetzner-bridge-test`, letzter Beat vor ~2 s, Version `phase7.5-auth-status`, Schwelle 900 s in `system_settings` gesetzt).

`bridge_raw_samples` in den letzten 60 Min: **0 Zeilen** — der Worker sendet also (wie geplant) keine Roh-Samples mehr, nur noch aggregierte 5-Min-Buckets. Das ist korrekt.

Also: der Worker liefert, aber der Suppress-Pfad in `loxone-api` greift nicht — es wird nach wie vor doppelt geschrieben.

### 2) Wahrscheinliche Ursache (unbestätigt — muss der Fix-Plan verifizieren)

Die Skip-Logik in `loxone-api` prüft vermutlich einen anderen Signal-Namen als der Worker aktuell setzt (Key-Wechsel in der Vergangenheit: `worker_active` vs. `loxone_ws_worker_primary` vs. `bridge_workers.status`). Das würde erklären, warum trotz frischem Heartbeat + aktiviertem Schalter der HTTP-Schreibpfad nicht ausgesetzt wird.

Erst prüfen, dann patchen — nicht raten. Ich mache das im Build-Modus.

### 3) IO-Budget

Kein direkter IOPS-Wert im Health-Snapshot verfügbar, aber die verfügbaren Indikatoren:
- Data disk 18 % belegt, DB 1,07 GB, WAL 128 MB → normal
- Connections 17/60, Pool 1/200 → entspannt
- Rollbacks seit Boot: 1001 — auffällig hoch, sollte separat angesehen werden

Die letzte gemeldete IO-Budget-Zahl aus Lovable (Snapshot, kein Live-Wert) ist im UI zu sehen; laut Memory ist die Anzeige immer verzögert. Verlässlich wäre nur die Supabase-Metrics-Ansicht.

### 4) Vorgeschlagenes Vorgehen (nach Freigabe)

1. In `supabase/functions/loxone-api/index.ts` den tatsächlichen Skip-Check lesen und mit `bridge_workers` / `system_settings.worker_active` abgleichen.
2. Ursache benennen (welche Bedingung false liefert) — mit Belegzeile aus dem Code, nicht per Vermutung.
3. Minimaler Fix: den Check so führen, dass er greift, wenn (a) `worker_active=true` UND (b) `bridge_workers.status='online'` UND (c) Heartbeat < `loxone_ws_stale_threshold_seconds`.
4. 10–15 Min später `meter_power_readings_5min` erneut nach `source` prüfen: `loxone_pull` sollte auf 0 fallen, nur `bridge_ws` bleibt.
5. IO-Budget-Anzeige über die nächsten ~2 h beobachten (Snapshot-Lag beachten).

Kein UI-Change nötig, reine Backend-Korrektur.
