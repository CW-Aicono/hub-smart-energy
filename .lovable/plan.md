

## Ziel

Klare Trennung der Verantwortlichkeiten: **Worker schreibt Live-Daten, Edge Functions machen nur noch Discovery & Steuerung.** Migration in 3 sicheren Stufen ohne Datenverlust.

## Stufe 1 — Worker auf Hetzner produktiv betreiben

**Infrastruktur (vom Nutzer auszuführen, separate Anleitung):**
- Hetzner CX22 (2 vCPU, 4 GB RAM, ~5 €/Monat), Ubuntu 24.04
- Docker + Docker Compose installiert
- `docker-compose.yml` mit `restart: always`, `gateway-worker:latest` Image
- Environment: `SUPABASE_URL`, `GATEWAY_API_KEY`, `POLL_INTERVAL_MS=30000`, `FLUSH_INTERVAL_MS=1000`
- Optional: Healthcheck-Endpoint + externes Monitoring (Uptime-Kuma / Healthchecks.io) auf den letzten `gateway_logs.created_at`-Eintrag

**Im Code (in dieser App):**
- Neues Super-Admin-Widget **„Gateway-Worker Status"** unter `/admin/infrastructure`:
  - Zeigt letzten Heartbeat aus `gateway_logs` (Schwellwert: > 3 Min = rot)
  - Zähler: aktive Loxone-WebSockets, Anzahl gepollter Shelly/HA-Geräte (aus Worker-Logs)
  - Warnt visuell, wenn kein Worker aktiv ist → verhindert Überraschungen wie aktuell
- Edge Function `gateway-worker-status` (neu, ~30 Zeilen): liest die letzten 5 Min aus `gateway_logs`, gibt aggregierte Metriken zurück

## Stufe 2 — Feature-Flag `WORKER_ACTIVE` (sicheres Umschalten)

**Datenbank:** Neue Tabelle `system_settings` (key/value, super-admin-only RLS):
```
key = 'worker_active', value = 'true' | 'false' (default: 'false')
key = 'worker_last_heartbeat', value = ISO-Timestamp (vom Worker geschrieben)
```

**Edge Functions** (`loxone-api`, `shelly-api`, später ggf. `home-assistant-api`):
- Vor jedem `meter_power_readings.insert(...)`-Block:
  ```
  const workerActive = await getSystemSetting('worker_active');
  const heartbeatFresh = workerLastHeartbeat > now() - 5min;
  if (workerActive && heartbeatFresh) {
    // Schreibpfad überspringen → nur Sensoren zurückgeben
  } else {
    // Bisheriger Schreibpfad als Fallback
  }
  ```
- **Sicherheits-Fallback:** Wenn der Worker länger als 5 Min keinen Heartbeat sendet, schreibt die Edge Function automatisch wieder → Datenkontinuität auch bei Worker-Ausfall.

**UI:** Toggle im Super-Admin („Worker als primäre Datenquelle aktiv"), zeigt Live-Heartbeat daneben.

## Stufe 3 — Edge Functions auf Discovery & Steuerung reduzieren

Nach 2–4 Wochen stabilem Worker-Betrieb (über Heartbeat-Monitoring nachgewiesen):
- Schreibpfad in `loxone-api`/`shelly-api` **vollständig entfernen** (kein Flag mehr nötig)
- Edge Functions behalten nur noch:
  - `action: "test"` — Verbindungstest
  - `action: "getSensors"` — Discovery (Sensorliste, ohne DB-Insert)
  - `action: "executeCommand"` — Steuerbefehle
- Polling-Intervalle in den Hooks (`useLoxoneSensorsMulti`) von 30 s auf 60–120 s erhöhen → reduziert Edge-Function-Kosten massiv
- Live-Werte in der UI kommen dann aus `meter_power_readings` (Realtime-Subscription) statt aus Edge-Function-Polling

## Reihenfolge & Sicherheitsnetz

```
Stufe 1 (Worker live + Monitoring)
   ↓ 1–2 Tage Beobachtung
Stufe 2 (Feature-Flag aus → an, mit automatischem Fallback)
   ↓ 2–4 Wochen Beobachtung über Heartbeat
Stufe 3 (Schreibpfad in Edge Functions entfernen, Polling reduzieren)
```

Jede Stufe ist **rückwärtskompatibel** und einzeln revertierbar. Stufe 2 garantiert per Heartbeat-Check, dass nie eine Datenlücke entsteht.

## Was dieser Plan NICHT macht

- Keine Änderung am Worker-Code selbst (läuft bereits stabil in `docs/gateway-worker/`)
- Keine Änderung am Discovery-/Steuer-Pfad (nur Schreibpfad wird gekapselt)
- Keine Migration alter Daten — `meter_power_readings` bleibt unverändert

## Geschätzter Aufwand (nur Code in dieser App)

- Stufe 1: ~1 neue Edge Function + 1 Admin-Widget (~150 Zeilen)
- Stufe 2: 1 Migration + 1 Helper + 2 Edge-Function-Patches (~80 Zeilen)
- Stufe 3: Entfernen von ~50 Zeilen aus 2 Edge Functions + 2 Hook-Anpassungen

