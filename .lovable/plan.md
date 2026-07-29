## Ziel

Vom Gateway ausgeführte Automationen werden **sofort** (nicht erst beim nächsten 60-s-Flush) via HTTP-Push an die Cloud gemeldet. Damit greift die 90-s-Owner-Lease zuverlässig, bevor der Cloud-Scheduler die nächste Evaluierungsrunde (30 s) startet — Doppelausführungen bei `hybrid` sind ausgeschlossen.

## Ausgangslage (verifiziert)

- `docs/ha-addon/index.ts`: sammelt Automation-Logs zusammen mit Readings im SQLite-Puffer und pusht sie am regulären `flush_interval_seconds`-Takt (jetzt 60 s) via `sync-automation-logs` an `gateway-ingest`.
- `supabase/functions/gateway-ingest/index.ts` `handlePushExecutionLogs`: bumpt `last_executed_at` und verlängert `owner_lease_until` um 90 s für `hybrid`-Regeln.
- `supabase/functions/automation-scheduler/index.ts`: läuft alle 30 s, skippt `hybrid` nur solange `owner_lease_until > now()`.

Kritisches Zeitfenster: Gateway führt lokal aus → bis zu 60 s Wartezeit bis Log-Push → währenddessen 1–2 Cloud-Scheduler-Zyklen ohne gültige Lease → **Cloud feuert dieselbe Regel nochmal**.

## Lösung: sofortiger Log-Push, entkoppelt vom Reading-Flush

### 1. Add-on: separater Push-Pfad für Automation-Logs

In `docs/ha-addon/index.ts`:

- Neue Funktion `pushAutomationLogImmediately(entry)`, die direkt nach jedem erfolgreichen (und fehlgeschlagenen) `executeAutomation`-Aufruf feuert.
- Der Log-Eintrag geht in einer eigenen kleinen In-Memory-Queue (`pendingAutoLogs`), die sofort an `gateway-ingest` (`action=sync-automation-logs`) mit **nur diesem einen Eintrag** gepusht wird.
- SQLite-Persistenz bleibt als **Fallback** erhalten: der Eintrag wird erst nach HTTP-200 aus dem lokalen Puffer gelöscht; bei Netzwerkfehler bleibt er drin und wird beim nächsten regulären 60-s-Flush erneut mitgesendet.
- Debounce/Coalescing: wenn innerhalb von ≤2 s mehrere Logs anfallen, werden sie zu einem Batch zusammengefasst (schützt vor Bursts, ohne die Lease-Wirkung zu verzögern).

### 2. Offline-Verhalten

- Bei fehlender Cloud-Verbindung fällt der Push still aus, Eintrag verbleibt im SQLite-Puffer, wird beim nächsten 60-s-Flush nachgereicht — kein Datenverlust, keine Verhaltensänderung gegenüber heute.
- Bei Backlog nach Wiederverbindung: der bestehende Batch-Push (1000er-Größe) übernimmt.

### 3. Cloud-Seite

- `gateway-ingest` bleibt unverändert — der bestehende `handlePushExecutionLogs` verlängert schon jetzt die Lease pro Eintrag.
- **Kein** neuer Endpoint, **keine** Migration, **kein** Config-Change nötig.

### 4. Config

- `flush_interval_seconds` (60 s) bleibt für Readings unverändert (IO-Budget-Schonung).
- Neuer interner Timer-Konstantenwert `AUTO_LOG_COALESCE_MS = 2000` — nicht als Add-on-Option, damit User nichts falsch stellen können.

## Betroffene Dateien

- `docs/ha-addon/index.ts` — sofortiger Push-Pfad + Coalescing.
- `docs/ha-addon/config.yaml` — Version-Bump auf `3.4.1`.
- Neues Kurz-Update-Doc: `docs/ha-addon/UPDATE-v3.4.1-INSTANT-AUTOMATION-PUSH.md` mit laienverständlicher Erklärung (Warum, Was ändert sich, Was muss der Anwender tun).

## Randfälle

- **Push schlägt fehl, Regel wurde lokal ausgeführt**: Lease läuft nicht → Cloud könnte in Ausnahmefällen doppelt feuern. Mitigierung: der Add-on retryt den Push nach 5 s einmalig, bevor er den Eintrag ausschließlich dem 60-s-Flush überlässt. Bei bewusstem Cloud-Ausfall ist ein Cloud-Fallback ohnehin nicht möglich → kein Doppelfeuer.
- **Uhr-Skew**: Lease-Zeitstempel wird weiterhin serverseitig gesetzt (`now()`), Gateway-Zeit irrelevant.
- **Reading-Latenz**: unverändert — nur Automations-Logs werden vorgezogen.

## Nicht Teil dieses Plans

- Änderung des `flush_interval_seconds` für Readings.
- Zweiter WSS-Kanal für Live-Werte (separater Vorschlag).
- Änderungen am Cloud-Scheduler oder der Lease-Länge.
