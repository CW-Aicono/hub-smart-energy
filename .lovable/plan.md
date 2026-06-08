# Root-Cause-Analyse: Disk-IO 75 %

Ich habe `pg_stat_statements`, `pg_stat_user_tables` und `cron.job` ausgewertet (Datenbank-Uptime: **120 Tage**). Damit lassen sich die tatsächlichen Schreib-Hotspots exakt benennen — nicht raten, messen.

## Die 5 echten Verursacher (Summe der Disk-Writes / WAL über 120 Tage)


| #   | Verursacher                                                                                                                    | Calls         | WAL geschrieben | Dirty Blocks | Anteil    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------- | ------------ | --------- |
| 1   | `INSERT meter_power_readings` (Gateway-Ingest, einzeln)                                                                        | **5 000 679** | **59 GB**       | 13.5 M       | **~65 %** |
| 2   | `INSERT ocpp_message_log` (jede OCPP-Frame einzeln)                                                                            | 1 000 991     | 6.5 GB          | 1.27 M       | ~7 %      |
| 3   | `INSERT meter_period_totals` (Upsert-Sturm)                                                                                    | 615 285       | 4.7 GB          | 354 k        | ~5 %      |
| 4   | `compact_power_readings_day()` (stündlich)                                                                                     | 92            | 4.4 GB          | 495 k        | ~5 %      |
| 5   | `INSERT meter_power_readings_5min` (Upsert) + `gateway_sensor_snapshots` Upserts + `integration_errors` + cron.job_run_details | —             | ~7 GB           | ~750 k       | ~8 %      |


Die Top 1 allein erklärt **65 %** der Schreiblast — jede einzelne Gateway-Messung läuft als **eigene Transaktion** durch PostgREST (`gateway-ingest`). Eine Transaktion erzeugt aber immer ein WAL-Flush + Full-Page-Write der Index-Seiten — bei 80-Byte-Payload landen real ~12 KB im WAL. Das ist der Hauptgrund, warum der Disk-IO-Budget so schnell hochläuft.

Zusätzlich auffällig (kleiner Effekt, aber unsauber):

- `charge_points` hat **6 Zeilen, aber 571 k Updates** (Heartbeat-Spam jede Sekunde)
- `gateway_device_inventory` 103 Zeilen / 1.2 M Updates
- `gateway_sensor_snapshots` 8 Zeilen / 250 k Updates
- `pv_forecast_hourly` 3 k Zeilen / 96 k Updates
- `spot_prices` 9 k Zeilen, aber 504 k Deletes + 504 k Inserts (Replace statt Upsert)
- `cron.job_run_details` ist **611 MB** groß (1.59 M alte Einträge gelöscht) — bloatet die Cron-Logs erheblich.

## Gegenmaßnahmen (in Reihenfolge der Wirkung)

### M1 — Gateway-Ingest auf Batch-Insert umstellen *(größter Hebel, allein ~50 % IO-Reduktion erwartet)*

- `supabase/functions/gateway-ingest` akzeptiert heute pro Request 1 Reading. Wir erweitern das Schema so, dass der Client (Hub/Worker) **eine Liste** schicken kann (`readings: [...]`), und führen einen einzigen `insert([...])` aus.
- Server-seitig zusätzlich ein kleines Coalescing-Fenster (alle Readings aus einem POST in **einer** Transaktion).
- Hub/Worker-Side: lokal alle 30-60 s flushen statt jede Messung sofort senden (lokaler Buffer ist bereits vorhanden — wir nutzen ihn nur konsequenter).
- Erwartet: 5 M Einzel-Inserts → ~80 k Batch-Inserts ⇒ WAL ca. 1/30.

### M2 — `ocpp_message_log` drosseln *(7 % IO)*

- Aktuell wird **jede** OCPP-Frame geloggt (Heartbeats, MeterValues, StatusNotifications). Wir behalten Logging für: `BootNotification`, `StartTransaction`, `StopTransaction`, `Authorize`, `*Error*`, sowie Statuswechsel. Heartbeats und reine MeterValues werden **nicht** mehr persistiert (sie sind ohnehin in `ocpp_meter_samples`/`charging_sessions` abgedeckt).
- Zusätzlich: `cleanup_old_ocpp_logs()` täglich auf **7 Tage** statt 30 reduzieren (Retention-Setting in der Funktion).

### M3 — Hochfrequente Mini-Tabellen entlasten

- `charge_points.last_seen_at` und `gateway_device_inventory.last_seen_at` nicht mehr bei jedem Heartbeat in die Haupt-Tabelle schreiben, sondern eine **Heartbeat-Tabelle** (`charge_point_heartbeats`) mit `ON CONFLICT DO NOTHING` + Aggregat-Read. Alternativ: `last_seen_at` nur alle 60 s aktualisieren (Skip-Update wenn `now() - last_seen_at < 60s`).
- `gateway_sensor_snapshots`: heute UPSERT bei jedem Polling — wir schreiben nur, wenn sich der Sensor-Hash ändert (Diff-Check vor UPDATE).
- `pv_forecast_hourly`: pro Lokation 1×/h, schreibt aber per Zeile per Stunde → in einem einzigen `INSERT … ON CONFLICT DO UPDATE` mit Array bündeln.

### M4 — `spot_prices` Upsert statt Replace

- Heute: `DELETE FROM spot_prices WHERE …; INSERT …` (= 504 k del + 504 k ins). Umstellung auf `INSERT … ON CONFLICT (timestamp, market_area, price_type) DO UPDATE` ⇒ keine Deletes, keine Index-Re-Inserts.

### M5 — `cron.job_run_details` Bloat

- Retention von `cleanup_cron_job_history` von aktuell „älter als X Tage löschen" auf **24 h** verkürzen + tägliches `VACUUM (FULL, ANALYZE) cron.job_run_details` als pg_cron-Job hinzufügen, damit die 611 MB physisch zurückgegeben werden.
- Minutentakt-Jobs (`automation-scheduler`, `dlm-scheduler`, `power-limit-scheduler`) bleiben bestehen, erzeugen aber dann nur noch 1440 Einträge/Tag statt akkumulierter Historie.

### M6 — `compact_power_readings_day()` inkrementell

- Heute verarbeitet die Funktion stündlich den gesamten letzten Tag (495 k Dirty Blocks/Run). Wir ändern sie auf **inkrementell** (nur die letzte volle Stunde) — der bisherige tägliche Voll-Compaction-Lauf bleibt nachts erhalten.

## Was wir NICHT tun

- **Kein Instanz-Upgrade** als ersten Schritt. Die Lovable-Cloud-Empfehlung im Screenshot ist Symptom-Behandlung; mit M1–M3 alleine fällt die IO-Last laut Messung um ~70 %.
- Keine Spekulations-Refactorings außerhalb der gemessenen Hotspots.

## Reihenfolge & geschätzter Aufwand

1. **M1 Gateway-Ingest Batch** (zentral, höchster Hebel) — ~60 min Umsetzung, danach beobachten ob Disk-IO sichtbar fällt
2. **M2 OCPP-Log Filter + Retention 7 Tage** — ~20 min
3. **M5 Cron-Bloat VACUUM + 24 h Retention** — ~10 min
4. **M4 spot_prices Upsert** — ~15 min
5. **M3 Skip-Update Logik für last_seen_at / Sensor-Hash-Diff** — ~30 min
6. **M6 inkrementelle Compaction** — ~20 min

Nach M1+M2+M5 (= ~90 min Arbeit) erwarte ich messbar < 30 % Disk-IO-Budget. Danach prüfen wir live, ob M3/M4/M6 überhaupt noch nötig sind.

## Verifikation nach jeder Maßnahme

Nach Umsetzung von M1 warten wir 24 h und prüfen:

```sql
SELECT calls, wal_bytes, shared_blks_dirtied
FROM extensions.pg_stat_statements
WHERE query LIKE '%meter_power_readings%' ORDER BY wal_bytes DESC LIMIT 5;
```

Sowie den Disk-IO-Wert im Lovable-Cloud-Dashboard.

---

**Bitte bestätige, dass ich mit M1 (Gateway-Ingest Batch) starten soll** — das ist der größte Hebel und in sich abgeschlossen. Danach gehen wir Maßnahme für Maßnahme weiter, jeweils mit Messung dazwischen.  
  
Bestätigung: Ja, wir setzen jetzt M! (**Gateway-Ingest Batch) um und prüfen danach wieder.**  
