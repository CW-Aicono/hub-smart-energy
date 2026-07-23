
## Ziel

Loxone-Datenpfad so umbauen, dass die Datenbank drastisch entlastet wird, ohne Live-Widgets, Automationen oder historische Charts zu brechen. Zusätzlich das (bereits aktive) Abfrage-Intervall im UI auf 5–60 Minuten begrenzen.

## Endarchitektur (Zielbild)

```text
Loxone Miniserver
        │  WebSocket (sekündlich)
        ▼
loxone-ws-worker  ────►  Realtime-Broadcast  ────► UI Live-Kacheln, DLM/Automation-Cache
        │                (loxone-live-{tenant})
        │
        │  1× pro 5-Min-Bucket
        │  (avg / max / count, worker-lokal aggregiert)
        ▼
gateway-ingest  ────►  meter_power_readings_5min   ────► Charts, Historie, Reports
                       (kein bridge_raw_samples mehr,
                        kein zweiter Schreibpfad,
                        kein Cloud-Aggregator-Cron)

loxone-periodic-sync (HTTP-Pull, 5–60 Min, default 15 Min)
        │
        └──►  meter_period_totals / _cumulative_readings  (driftfreie kWh-Zählerstände)
        └──►  Fallback-Ingest in meter_power_readings_5min,
              wenn für einen Meter seit >2 Bucket-Intervallen
              kein WS-Wert eingegangen ist
```

## Warum das die richtige Balance ist

- **Live bleibt live**: Broadcast fließt weiter pro Event, EnergyFlowMonitor / LiveValues / DLM-Realtime sehen Sekundenwerte.
- **Historie bleibt dicht**: Charts lesen `meter_power_readings_5min` – wird alle 5 Min garantiert befüllt, entweder vom Worker (WS gesund) oder vom Pull-Fallback.
- **IO-Last minimiert**: Pro Zähler max. 12 Inserts/Stunde in `meter_power_readings_5min` statt hunderten Rohwerten in `bridge_raw_samples`. Zweiter Schreibpfad (`meter_power_readings`) und der Cloud-`bridge-aggregator` entfallen für Loxone.
- **kWh driftfrei**: HTTP-Pull bleibt für kumulierte Zählerstände zuständig – wie heute.

## Umbau in vier Phasen (jede einzeln deploybar & rückrollbar)

### Phase 1 – UI-Mindestintervall auf 5 Minuten (isoliert, sofort)

- `src/components/integrations/EditIntegrationDialog.tsx`:
  - Grenzen `1` → `5` in Reset-Logik (Zeile 74) und Clamp (Zeile 89).
  - Input-Feld `min={5}`, Hilfetext auf „Erlaubt: 5–60 Minuten. Empfehlung: 15 Minuten." anpassen.
- `supabase/functions/loxone-periodic-sync/index.ts` (Zeile 108ff): Untergrenze in `rawInterval`-Validierung ebenfalls auf 5 heben, damit alte Werte < 5 in der DB serverseitig zu 5 hochgezogen werden.
- Keine Migration nötig; bestehende Werte < 5 werden beim ersten Speichern bzw. beim Sync-Aufruf normalisiert.

Bestätigt aus Recherche: `poll_interval_minutes` wird in `loxone-periodic-sync/index.ts:108` tatsächlich verwendet, die Einstellung ist **nicht fake**.

### Phase 2 – Worker-seitige 5-Min-Aggregation im `loxone-ws-worker`

- Neuer In-Memory-Puffer pro Sensor: rollierendes Fenster auf 5-Min-Bucket (`Math.floor(ts / 300000) * 300000`), sammelt `sum`, `count`, `max`, `min`, `last`.
- Bei Bucket-Wechsel: flush an `gateway-ingest` mit neuem Action `bridge-power-5min`, Payload `{ meter_id?/sensor_uuid, bucket_start, avg_kw, max_kw, count }`.
- Broadcast (`loxone-live-{tenantId}`) bleibt unverändert pro Event – Live-UI und Automationen sind entkoppelt.
- `bridge-readings`-Action bleibt vorerst bestehen (Kompatibilität), wird aber im Worker nicht mehr aufgerufen. Nach Feldtest entfernen.
- Cold-Start-Verhalten: unvollständiger erster Bucket wird nach Flush verworfen (kein halber Punkt in der DB).

### Phase 3 – `gateway-ingest` neuer Handler `bridge-power-5min`

- Upsert direkt in `meter_power_readings_5min` (`onConflict: meter_id,bucket,resolution_minutes`, `source: 'bridge_ws'`).
- Kein Insert in `bridge_raw_samples`, kein Insert in `meter_power_readings`.
- Delta-Guard und Batch-Coalescing entfallen an dieser Stelle (nicht mehr nötig – nur 12 Rows/h/Meter).
- Legacy-Handler `handleBridgeReadings` bleibt als No-Op-Broadcast (Fallback für alte Worker-Versionen), aber ohne DB-Writes.
- `bridge-aggregator`-Cron wird pausiert (kein Rollback-Risiko, nur ein `cron.unschedule`).

### Phase 4 – Pull-Fallback in `loxone-periodic-sync`

- Neue Logik: pro Meter prüfen, ob in `meter_power_readings_5min` in den letzten `2 × poll_interval_minutes` ein Bucket mit `source='bridge_ws'` existiert.
- Wenn nein → einen synthetischen 5-Min-Bucket aus dem aktuellen HTTP-Sample schreiben (`source: 'loxone_pull'`), damit Charts nicht flatlinen, wenn der WS-Worker offline ist.
- Wenn ja → wie bisher nur kWh-Zählerstände schreiben, keine Power-Rows.
- Retention & Bereinigung unverändert.

## Was ich NICHT anfasse

- `useEnergyData`, `EnergyFlowMonitor`, `LiveValues`, `DynamicDlmCard`, `_shared/meterPower.ts` – lesen weiterhin ihre gewohnten Quellen (`meter_power_readings_5min` bzw. Broadcast). Kein Widget-Refactor.
- OCPP-Pfad, Shelly, Fronius, Peak-Shaving, DLM – bleiben unverändert.
- RLS-Policies, Grants, Storage.

## Rollout-Reihenfolge & Verifikation

1. **Phase 1** deployen (UI + Sync-Untergrenze). Verifikation: Feld akzeptiert nur 5–60, `loxone-periodic-sync` läuft weiter durch.
2. **Phase 3** (Handler) vor Phase 2 deployen – erst Backend bereit, dann Worker umstellen. Verifikation: `bridge-power-5min` per curl testbar, schreibt Row.
3. **Phase 2** Worker-Update (`docs/loxone-ws-worker` + Update-Anleitung, Rollout auf Hetzner-Live-Worker). Verifikation nach 15 Min: neue Rows in `meter_power_readings_5min` mit `source='bridge_ws'`, `bridge_raw_samples` wächst nicht mehr.
4. **Phase 4** Fallback aktivieren + Aggregator-Cron pausieren. Verifikation: WS-Worker gezielt für 15 Min stoppen → Pull-Fallback erzeugt Buckets, Charts bleiben gefüllt.
5. Nach 48 h stabilem Lauf: `bridge_raw_samples`-Tabelle auf 1 h Ringbuffer eindampfen (separater Cleanup-Schritt, außerhalb dieses Plans).

## Rollback

- Phase 1: einzelner File-Edit rückrollbar.
- Phase 3: Handler entfernen, alte `bridge-readings`-Logik wieder aktivieren.
- Phase 2: alten Worker-Container neu starten (Image-Tag bleibt erhalten).
- Phase 4: Fallback-Block auskommentieren, Aggregator-Cron reaktivieren.

## Betroffene Dateien (Kurzliste)

- `src/components/integrations/EditIntegrationDialog.tsx`
- `supabase/functions/loxone-periodic-sync/index.ts`
- `supabase/functions/gateway-ingest/index.ts` (neuer Handler + Broadcast-Only-Pfad)
- `docs/loxone-ws-worker/index.ts` (Bucket-Aggregation)
- `docs/loxone-ws-worker/UPDATE-ANLEITUNG.md` (neue Version)
- SQL-Migration: `cron.unschedule('bridge-aggregator-*')` (Phase 4)
