# Live-Werte über WebSocket wiederherstellen — ohne IO-Risiko

## Befund (im Code verifiziert)

Die WS-Verbindung ist stabil, aber der Live-Pfad ist seit der IO-Optimierung **abgeschaltet**:

- `docs/loxone-ws-worker/index.ts`, `flush()` (Zeile 934 ff.): beginnt mit `return;` — Kommentar „v1.6: Legacy-Pfad hart deaktiviert".
- Der zugehörige Timer ist auskommentiert (Zeile 1409: `// setInterval(() => { flush()... }, FLUSH_INTERVAL_MS);`). Aktiv ist nur noch `flushBuckets()` alle 60 s → `gateway-ingest?action=bridge-power-5min`.
- Der Broadcast-Kanal `loxone-live-<tenant_id>`, den `src/pages/LiveValues.tsx` (Zeile 505 ff.) abonniert, wird **ausschließlich** in `gateway-ingest`, Action `bridge-readings` (Zeile 1537 ff.) gesendet — also von genau der Funktion, die der Worker nicht mehr aufruft.

Folge: Es kommen gar keine Echtzeit-Events mehr an. Die Oberfläche zeigt den jüngsten DB-Datensatz, und der stammt bei vielen Zählern (u. a. „Erzeugung") aus dem HTTP-Poll alle 15 Minuten — daher -77,7 kW statt -31,2 kW.

Ergebnis zu Ihrer Frage: **Ja, Punkte 1–3 des alten Plans sind Kosmetik bzw. Datenpflege.** Der Kern ist der Worker.

## Warum der Live-Pfad damals IO gekostet hat

`bridge-readings` macht zwei Dinge in einem Aufruf: es schreibt jedes Sample in `bridge_raw_samples` (Ringpuffer, DB-Schreiblast) **und** verschickt den Broadcast. Abgeschaltet wurde beides gemeinsam — obwohl nur das Schreiben teuer ist. Ein Broadcast erzeugt **keine** Datenbank-IO; er läuft über den Realtime-Dienst.

## Umsetzung

### 1. Reiner Live-Kanal ohne DB-Schreibvorgang (Cloud-Seite)
- In `gateway-ingest` Action `bridge-readings` ein Flag `live_only: true` unterstützen: Samples werden gemappt und gebroadcastet, aber **kein** Insert in `bridge_raw_samples`, kein SOC-Update, keine 5-Min-Aggregation.
- Antwort meldet `inserted: 0`, damit die Trennung nachvollziehbar bleibt.
- Persistenz bleibt unverändert beim bestehenden 5-Minuten-Bucket-Pfad (`bridge-power-5min`). Am Schreibvolumen ändert sich dadurch **nichts**.

### 2. Worker: Live-Push reaktivieren (IO-neutral)
- `flush()` entsperren, aber als reinen Broadcast-Push mit `live_only: true`.
- Timer wieder aktivieren, mit konservativen Standardwerten: `FLUSH_INTERVAL_MS = 5000`, `MIN_DELTA = 0.05 kW` für `pwr`, Keepalive-Push spätestens alle 60 s je Zähler.
- Kill-Switch bleibt wirksam: `workerPaused` und der bestehende Killswitch-Endpunkt schalten auch den Live-Push ab.
- Deckelung: maximal N Events pro Push-Zyklus (Coalescing je UUID auf den letzten Wert, ist bereits so implementiert), damit ein Miniserver mit vielen Blöcken den Kanal nicht flutet.

### 3. Abdeckungslücke schließen
- Der Worker mappt Block-UUIDs über die LoxAPP3-Expansion (Zeile 680 ff.). Blöcke ohne verwertbaren State werden bei Wasser/Gas verworfen, bei Strom/Wärme auf die Block-UUID zurückgestuft. Beim Verbinden loggt er bereits `mapped/fallback/totalStateUuids` in `bridge_event_log`.
- Nach der Reaktivierung wird anhand dieser Logs und der eingehenden Broadcast-Events geprüft, welche Zähler weiterhin stumm bleiben, und das Mapping gezielt nachgezogen (statt pauschal alle Blöcke zusätzlich zu abonnieren).

### 4. Verbraucher der Live-Werte
- `src/pages/LiveValues.tsx` hört bereits auf `loxone-live-<tenant>` — funktioniert ohne Änderung wieder.
- `EnergyFlowMonitor` und die Gerätekacheln/Steuerungen bekommen denselben Broadcast-Abonnenten (gemeinsamer Hook `useLoxoneLiveBroadcast`), damit alle drei Oberflächen dieselbe Quelle nutzen, statt DB-Snapshots zu pollen.
- Nebeneffekt: Die 5-Minuten-Poll-Intervalle in den Widgets können bleiben — sie sind dann nur noch Sicherheitsnetz.

## IO-Sicherheit — was garantiert unverändert bleibt

- Kein neuer Insert, kein neues Update, kein zusätzlicher Cron-Job.
- `bridge_raw_samples` bleibt im Live-Pfad leer (Flag `live_only`).
- Einzige zusätzliche Last: Realtime-Broadcast-Nachrichten (Netzwerk, nicht Disk-IO) und ein HTTP-Aufruf des Workers alle 5 s.
- Ausrollen zuerst auf **einem** Miniserver, `db_health` vor/nach vergleichen, dann Flottenweit.

## Auslieferung

Punkt 1 läuft in diesem Projekt (Edge Function). Punkte 2 und 3 betreffen den Worker auf Hetzner — dafür entsteht eine Update-Anleitung analog zu `docs/loxone-ws-worker/UPDATE-v1.8-stuck-slot-reset.md` (Version v1.10: „Live-Broadcast ohne DB-Schreiblast").
