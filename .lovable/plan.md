## Korrektur: Du hast recht — der Worker-Fix allein reicht nicht

### Was die DB-Statistik wirklich zeigt (`pg_stat_user_tables`, kumulativ)


| Tabelle                     | Inserts       | Updates      | Deletes   | Live-Rows |
| --------------------------- | ------------- | ------------ | --------- | --------- |
| `meter_power_readings`      | **12,86 Mio** | 0            | 12,00 Mio | 865 k     |
| `meter_power_readings_5min` | 1,49 Mio      | **1,98 Mio** | 2         | 1,47 Mio  |
| `meter_period_totals`       | 6 k           | **9,79 Mio** | 344       | 5,7 k     |
| `ocpp_message_log`          | 1,03 Mio      | 0            | 894 k     | 139 k     |
| `spot_prices`               | 508 k         | 0            | 496 k     | 11 k      |
| `charge_points`             | 1,5 k         | 636 k        | 51        | 6         |
| `integration_errors`        | 80 k          | 165 k        | 5 k       | 75 k      |
| `tasks`                     | 149 k         | 69 k         | 36 k      | 112 k     |
| `pv_forecast_hourly`        | 3,7 k         | 108 k        | 168       | 3,5 k     |


### Die eigentliche IO-Last (drei Treiber, nicht einer)

**1. Schreib-Verstärkung über Trigger (größter Posten)**
Jeder Insert in `meter_power_readings` löst Folge-Updates aus:

- 1 Insert Rohwert → 1 Update in `meter_power_readings_5min` → 1 Update in `meter_period_totals`
- Verhältnis Updates/Inserts bei `meter_period_totals` = **1.613 zu 1**. Das heißt: pro Rohwert-Insert werden im Schnitt ~1.600 Aggregations-Zellen aktualisiert (vermutlich pro Periode × Energietyp).
- Das ist DER Hauptverursacher der Disk-IO, **unabhängig vom Loxone-Worker**, und war auch vor Hetzner schon aktiv (Brighthub, Shelly, Schneider, MQTT etc. nutzen denselben Pfad).

**2. Heißlauf-Tabellen ohne Bezug zu Loxone**

- `charge_points`: **636 k Updates** auf 6 Live-Rows — jede OCPP-Heartbeat-Nachricht schreibt Status zurück.
- `ocpp_message_log`: 1 Mio Inserts + 894 k Deletes — Log-Churn.
- `spot_prices`: 508 k Inserts / 496 k Deletes — wahrscheinlich täglicher Full-Refresh statt UPSERT.
- `pv_forecast_hourly`: 108 k Updates auf 3,5 k Rows.

**3. Loxone-Worker Spam** (mein vorheriger Befund)
Rathaus-Energiemonitor: 23.770 Inserts/Tag. Real, aber „nur" Posten 3 — anteilig vielleicht 5-10 % der Gesamt-IO.

### Ehrliche Konsequenz

Den Worker zu fixen senkt die IO **moderat** (geschätzt 5-10 %), löst das 82 %-Problem aber **nicht** dauerhaft. Die strukturelle Schreib-Verstärkung über Trigger und die OCPP/Spotprice-Churn-Tabellen bleiben.

### Optionen (nach Wirkung sortiert, du entscheidest, was wir anfassen)

**A) Trigger-Aggregation entzerren** — größter Hebel

- Aktuell wird `meter_period_totals` synchron pro Insert via Trigger aktualisiert.
- Alternative: Trigger entfernen, Aggregation per `pg_cron`-Job alle 5 min batchweise (1 Schreiboperation statt 1.600).
- Erwartete IO-Reduktion: **40-60 %**.
- Risiko: Aggregat-Werte hinken bis zu 5 min hinterher. Aufwand: 1 Migration + 1 Edge/SQL-Job.

**B) `charge_points`-Heartbeat-Updates drosseln**

- 636 k Updates auf 6 Zeilen ist absurd. Nur bei Status­wechsel oder ≥60 s Abstand schreiben.
- Erwartete IO-Reduktion: 10-15 %.
- Risiko: keins. Aufwand: 1 Code-Änderung im OCPP-Server.

**C) `spot_prices` UPSERT statt Delete+Insert**

- Erwartete IO-Reduktion: 5 %.
- Aufwand: 1 Edge-Function-Änderung.

**D) Loxone-Worker Dedupe** (mein vorheriger Plan)

- Erwartete IO-Reduktion: 5-10 %.
- Aufwand: 1 Datei, kein DB-Change.

### Empfehlung

Bevor wir irgendetwas implementieren: **EXPLAIN/Trigger-Definition prüfen** (5 Min, kein Credit-Risiko), um zu bestätigen welcher Trigger die 9,79 Mio Updates auf `meter_period_totals` erzeugt. Erst danach entscheiden, ob A, B, C, D — oder Kombination — angefasst wird.

### Fragen an dich

1. Soll ich zuerst die Trigger-Analyse machen (lesend, kostengünstig) und dann einen gezielten Plan vorlegen?
2. Oder direkt mit Option B (`charge_points`-Drossel, risikofrei) starten?
3. Option D (Loxone-Worker) wie ursprünglich geplant, parallel?  
  
Antwort: Ja, bitte führe zuerst nur eine Trigger-Analyse durch.  
  
  
  
 