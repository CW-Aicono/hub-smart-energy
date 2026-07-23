## Status Testumgebung (verifiziert)

- `meter_power_readings_5min` letzte 2 h: **440 Rows, alle `source=bridge_ws**`, exakt 6 Buckets/h pro Meter → Worker-Aggregation läuft sauber.
- `bridge_raw_samples` letzte 1 h: **898 Rows** (648 Tenant `0ce0c43a…`, 250 ohne Tenant-Zuordnung). D. h. mindestens **ein Worker schreibt noch den alten `bridge-readings`-Pfad**. Solange das der Fall ist, darf der Aggregator-Cron nicht abgeschaltet werden — sonst gehen Daten dieses Tenants verloren.
- Aktive Crons: `bridge-aggregator-every-5min`, `cleanup-bridge-raw-samples-hourly`, `loxone-periodic-sync-15min` — alle aktiv.

**Fazit:** Der neue Pfad funktioniert, aber Phase 4 kann nicht komplett zünden, bevor alle Worker (Live + Staging) auf die aggregierende Version umgestellt sind.

## Phase 4 — in dieser Reihenfolge

### Schritt 4a: Pull-Fallback in `loxone-periodic-sync` ergänzen (jetzt, safe)

- In `supabase/functions/loxone-periodic-sync/index.ts`: pro Meter prüfen, ob in `meter_power_readings_5min` in den letzten `2 × poll_interval_minutes` ein Bucket mit `source='bridge_ws'` existiert.
- Wenn nein → einen 5-Min-Bucket aus dem aktuellen HTTP-Sample schreiben mit `source='loxone_pull'` (Upsert `onConflict: meter_id,bucket,resolution_minutes`).
- Wenn ja → wie bisher nur kWh-Zählerstände, kein Power-Row.
- Kein Eingriff in Discovery/Fehlermanagement/Zählerstände.
- Verifikation: Worker gezielt 15 Min stoppen → in `meter_power_readings_5min` müssen Rows mit `source='loxone_pull'` auftauchen, dann Worker wieder starten → `bridge_ws` übernimmt.

### Schritt 4b: Worker-Rollout abschließen (User-Aktion Hetzner)

- Alten Live-Worker `loxone-ws-worker-live` auf die neue Image-Version bringen (gleiche Prozedur wie Staging).
- Kriterium für Schritt 4c: **24 h** lang keine neuen Rows in `bridge_raw_samples` (`SELECT count(*) FROM bridge_raw_samples WHERE received_at > now() - interval '1 hour'` = 0). Ich kann das Monitoring-Query auf Wunsch als wiederkehrenden Check einbauen.

### Schritt 4c: Aggregator-Cron pausieren + Raw-Samples eindampfen (nach 24 h Stille)

- `SELECT cron.unschedule('bridge-aggregator-every-5min');`
- `bridge_raw_samples` bleibt als Tabelle bestehen (leerer Puffer), Retention-Cron kümmert sich um den Rest.
- Legacy-Handler `handleBridgeReadings` in `gateway-ingest` auf No-Op-Broadcast reduzieren (keine DB-Writes mehr), damit ältere Worker-Versionen den Delta-Guard/DB nicht mehr belasten.

## Rollback pro Schritt

- 4a: Fallback-Block auskommentieren, Deploy.
- 4b: alten Container per Image-Tag wieder starten.
- 4c: `cron.schedule('bridge-aggregator-every-5min', '*/5 * * * *', $$…$$)` reaktivieren, Handler-Änderung reverten.

## Empfehlung

Jetzt nur **Schritt 4a** umsetzen und deployen — das ist unabhängig vom Worker-Rollout und macht das System resilient gegen Worker-Ausfälle. **Schritt 4c** erst, wenn Hetzner-Live-Worker aktualisiert ist und `bridge_raw_samples` 24 h still ist.

Soll ich mit Schritt 4a starten?  
  
Antwort: Ja, starte mit Schritt 4 a. Hinweis: Hetzner-Live-Worker ist aktualisiert, das habe ich zusammen mit dem Lovable-Test-Worker gemacht.  
  
  
  
  
  