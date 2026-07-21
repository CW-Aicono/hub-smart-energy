# IO-Budget-Analyse & Gegenmaßnahmen

## Was ich in den letzten 8-10h gemessen habe

### Keine Volumen-Spitze bei Rohdaten

Stündliche Insert-Raten sind stabil (kein Ausreißer):

- `bridge_raw_samples`: ~1.750/h (Loxone-WS läuft normal)
- `meter_power_readings`: ~1.070/h
- `meter_power_readings_5min`: ~370/h
- `ocpp_meter_samples`, `ocpp_message_log`, `storage_soc_readings`, `automation_execution_log`: konstant

→ Die Insert-Last selbst ist **nicht** die Ursache des Sprungs von 50 % → 76 %.

### Ursache: Update-Churn auf sehr kleinen Hot-Tabellen

`pg_stat_user_tables` zeigt massive UPDATE-Zahlen gegen winzige Tabellen — jeder Update schreibt Row + alle Indizes + WAL. Das ist der dominante IO-Verursacher:


| Tabelle                        | Live-Rows | Updates seit Statsreset | Verhältnis                                     |
| ------------------------------ | --------- | ----------------------- | ---------------------------------------------- |
| `location_integrations`        | 10        | **37.729**              | 3.700×/Row                                     |
| `charge_points`                | 6         | **29.997**              | 5.000×/Row (`last_ws_pong_at`, `ws_connected`) |
| `meter_period_totals`          | 7.548     | **143.273**             | 19×/Row (ständige Upserts)                     |
| `energy_storages`              | 3         | 9.366                   | 3.100×/Row (`current_soc_pct`)                 |
| `gateway_sensor_snapshots`     | 8         | 10.023                  | 1.250×/Row (Upsert)                            |
| `meter_loxone_daily_snapshots` | 1.259     | 44.835                  | 36×/Row                                        |
| `loxone_ws_session_log`        | 8.023     | 13.027                  | Events-Counter-Update                          |
| `tasks`                        | 115.932   | 74.561                  | Hoch, siehe unten                              |


### Zusatzfund: fehlender Autovacuum auf großer Tabelle

- `meter_power_readings_5min` = **586 MB**, `last_autovacuum = NULL` (noch nie), 7.245 Dead-Tuples → braucht Vacuum + tuning.
- `bridge_raw_samples` hat 133k Deletes bei nur 40k Live-Rows → gesundes Delete-Muster, aber Vacuum-Last hoch.

### Anzeige-Semantik beachten

Die Lovable-Anzeige „76 %" ist ein bis zu 48 h alter Alert-Snapshot (siehe Memory *IO-Budget Anzeige-Semantik*), kein Live-Wert. Der reale IO-Druck kann jetzt bereits niedriger sein — die *Ursachen* oben sind aber real und dauerhaft.

---

## Gegenmaßnahmen (priorisiert)

### P1 – Charge-Point-Heartbeat-Writes drosseln (größter Hebel)

Zwei Slow-Queries: `UPDATE charge_points SET last_ws_pong_at = …` (21.109 calls) und `SET ws_connected = …` (4.401 calls). Ziel: **nur schreiben wenn sich Wert relevant ändert**.

- Im OCPP-Persistent-Server (`docs/ocpp-persistent-server/src/keepAlive.ts` / `chargePointRegistry.ts`): `last_ws_pong_at` maximal alle 60 s persistieren (In-Memory throtteln), statt bei jedem Pong.
- `ws_connected` nur schreiben bei tatsächlichem State-Wechsel (Boolean-Vergleich gegen letzten geschriebenen Wert).

### P2 – `location_integrations`-Updates reduzieren

37k Updates auf 10 Zeilen deuten auf `last_seen_at`/Sync-Metadaten-Writes bei jedem Poll-Zyklus. 

- Update nur alle 60 s je Integration schreiben (Debounce im Ingest-Path/Worker).
- Prüfen, welcher Caller (Loxone-WS-Worker, gateway-ingest, MQTT-Bridge) schreibt und dort die Frequenz kappen.

### P3 – Storage-SoC + Gateway-Snapshot-Updates poolen

- `energy_storages.current_soc_pct`: nur updaten wenn |Δ| ≥ 1 % oder alle 5 min.
- `gateway_sensor_snapshots`: bereits Upsert; prüfen ob Push-Frequenz auf 1/min statt <1 s liegt.

### P4 – `meter_period_totals`/`meter_loxone_daily_snapshots` Upserts bündeln

143k Upserts auf 7.548 Rows = derselbe Tages-/Monatstotal wird ständig überschrieben. 

- Aggregations-Job (Cron/Realtime-Trigger) so ändern, dass Totals nur bei tatsächlicher Änderung geschrieben werden (Vergleich vor UPSERT), oder gebatcht am Ende eines Intervalls.

### P5 – `meter_power_readings_5min` Autovacuum aktivieren

Tabelle wurde nie autovacuumed. Migration:

```sql
ALTER TABLE public.meter_power_readings_5min SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 10
);
VACUUM (ANALYZE) public.meter_power_readings_5min;
```

Analog für `meter_power_readings_5min_bridge`, `meter_cumulative_readings`, `tasks`.

### P6 – `tasks`-Update-Storm analysieren

115k Rows, 74k Updates. Vermutlich Auto-Resolve-Loop der Integration-Errors. Prüfen, ob `updated_at`-Trigger + Status-Recalc unnötig oft feuert; ggf. WHERE-Guard vor UPDATE.

---

## Technische Umsetzung (in dieser Reihenfolge)

1. **Analyse-Migration + Vacuum-Tuning** (P5) — schnell, sofort messbar.
2. **Code-Fixes Worker-Seite**: OCPP-Server + Loxone-WS-Worker Heartbeat-Throttling (P1, P2).
3. **Aggregations-Guards** in Edge Functions (P3, P4, P6) — WHERE-Vergleiche vor UPDATE.
4. Nach ~1 h erneut `slow_queries` + `pg_stat_user_tables` messen, um Effekt zu belegen.

**Kein Instance-Upgrade** vorgeschlagen — das ist Update-Frequenz, kein Kapazitäts-Problem.

## Was ich als Nächstes brauche

Freigabe zur Umsetzung — soll ich mit **P1 + P5** starten (größter Hebel, geringstes Risiko), oder alle Punkte in einem Rutsch?  
  
Antwort: Gerne alle Punkte in einem Rutsch umsetzen.