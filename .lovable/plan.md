## Ausgangslage

`ocpp_message_log` ist aktuell der zweitgrößte Schreib-Hotspot:
- ~1 Mio. Inserts kumuliert
- Pro OCPP-Nachricht **zwei** Inserts (eingehend + ausgehende Antwort)
- Jeder Insert geht als eigener HTTP-Call vom Persistent-Server → Edge-Function → DB (kein Batching)
- Heartbeats (alle ~5 min) und MeterValues (alle ~10–30 s) dominieren das Volumen, sind aber wichtig fürs Debugging — sollen bleiben

Vergleich Monta (26.000 Zeilen/Monat pro Charge Point): bewältigt Monta nur, weil dort Batch-Append-only-Logs in spaltenorientierten Backends laufen. Wir können einen ähnlichen Effekt in Postgres erreichen, **ohne Daten zu verlieren**.

## Ziel

Schreiblast auf `ocpp_message_log` um **~80–90 %** senken, vollständige Historie behalten, Lesbarkeit im UI gleich oder besser.

## Maßnahmen (in dieser Reihenfolge)

### 1. Request/Response zu einer Zeile zusammenführen (–50 % Zeilen, sofort)
Aktuell wird pro OCPP-Aufruf zweimal geschrieben (incoming Call + outgoing CallResult). Wie Monta das CSV zeigt: dort steht **eine** Zeile pro Transaktion mit Feldern `request` und `response`.

- Neue Spalten `response_message jsonb` und `response_at timestamptz` ergänzen.
- Persistent-Server merkt sich pro `message_id` den Request kurz im Speicher (Map, TTL 30 s) und schreibt **erst beim Eintreffen der Antwort** eine einzige Zeile.
- Outbound-Server-Initiated Calls (RemoteStart usw.) → ebenso: 1 Zeile pro Round-Trip.
- Fallback: wenn keine Antwort kommt (Timeout 30 s), wird die Zeile mit `response_message = null` geflushed → keine Info-Verluste.

### 2. Batched Inserts im Persistent-Server (–80 % HTTP-Calls + DB-Roundtrips)
Der Server schreibt heute bei jeder Nachricht synchron. Stattdessen:

- In-Memory-Puffer pro Prozess, geflusht **alle 2 s** ODER bei **50 Einträgen**, je nachdem was zuerst eintritt.
- Ein Bulk-Insert per Edge-Function-Call (`log-messages-batch` mit Array).
- Bei Server-Shutdown wird der Puffer noch geflusht (graceful drain).
- Vorteil: aus ~1 Mio. Einzel-Inserts werden <50 k Bulk-Inserts → WAL- und Index-Pflege drastisch geringer, aber jede einzelne Nachricht bleibt zeilenweise in der DB.

### 3. Monatliche Tabellen-Partitionierung (bessere Vacuum-Last + günstige Retention)
`ocpp_message_log` wird zu einer **RANGE-partitionierten** Tabelle (nach `created_at`, monatlich).

- pg_cron-Job legt jeden Monatsanfang die neue Partition an.
- Indexe pro Partition bleiben klein → Inserts schneller, Autovacuum schneller.
- Retention/Archivierung später durch reines `DETACH PARTITION` möglich (kein Massen-DELETE).
- Migration: neue partitionierte Tabelle anlegen, alte Daten in passende Partitionen einhängen, dann umbenennen. Bestehende Policies, GRANTs und FKs übernehmen.

### 4. Heartbeat-Sampling als optionaler späterer Schritt (NICHT in diesem Plan)
Falls nach 1+2+3 die I/O-Last immer noch zu hoch sein sollte, könnte man Heartbeats später deduplizieren (1 Zeile pro 10 min mit Counter). Bewusst **erst nach Messung** entscheiden, damit wir jetzt nichts verlieren.

## Technische Details

**DB-Migration**
```sql
-- Spalten für Response-Paarung
ALTER TABLE public.ocpp_message_log
  ADD COLUMN response_message jsonb,
  ADD COLUMN response_at timestamptz;

-- Partitionierte Nachfolge-Tabelle
CREATE TABLE public.ocpp_message_log_p (LIKE public.ocpp_message_log INCLUDING ALL)
  PARTITION BY RANGE (created_at);

-- monatliche Partitionen via pg_cron-Funktion ocpp_log_ensure_partition()
-- Initial-Befüllung + RENAME im selben Migrationsschritt
```
GRANTs und RLS-Policies werden 1:1 übernommen.

**Edge-Function `ocpp-persistent-api`**
- Neue Action `log-messages-batch`: nimmt `entries: [{ chargePointId, direction, raw, responseRaw?, responseAt? }]`, ein einziger `.insert([...])`.
- Alte Action `log-message` bleibt rückwärtskompatibel (nutzt intern dieselbe Insert-Logik).

**Persistent-Server (`docs/ocpp-persistent-server/`)**
- `messageLog.ts`: in-memory `pendingResponses: Map<messageId, {row, timer}>` + `flushBuffer: BatchEntry[]`.
- `setInterval(flush, 2000)` + `if (buffer.length >= 50) flush()`.
- `index.ts`, `commandDispatcher.ts`, `configurationProbe.ts`: bleibt API-kompatibel (rufen weiterhin `logOcppMessage`/`logOcppResponse`).

**UI**
- `useOcppLogs.tsx` zeigt Request + Response künftig in einer Zeile (Spalte „Antwort" mit Status/Payload-Preview), Realtime-Subscription bleibt auf `ocpp_message_log`.

## Validierung
1. Nach Migration: `pg_stat_user_tables` für `ocpp_message_log` beobachten → Insert-Rate sollte < 20 % der Vorwoche sein.
2. Stichprobe im UI: jede OCPP-Transaktion erscheint genau einmal mit Request **und** Response.
3. Edge-Function-Logs auf `log-messages-batch` Fehlerfreiheit prüfen.
4. Nach 30 min `supabase--db_health` erneut prüfen.

## Was NICHT gemacht wird
- Kein Filtern oder Wegwerfen von Heartbeats/MeterValues (Info-Verlust ausgeschlossen).
- Kein Wechsel des Storage-Backends.
- Keine Änderung der OCPP-Server-Logik außer Logging.
