## Ergebnis der read-only Analyse

Ich kann aus den gemessenen Daten keine einzelne langsame SELECT-Abfrage als Hauptursache belegen. Die belastende Ursache ist Write-/WAL-Last aus Gateway-/Loxone-/Shelly-Datenpfaden plus periodische Reaggregation.

### Harte Messwerte

**pg_stat_statements-Zeitraum:** seit `2026-07-18 12:25 UTC` bzw. je Statement ab Erfassung.

Top-Verursacher nach WAL/Dirty Blocks:

1. `meter_power_readings` INSERT
   - `24.249` Calls
   - `588.860 ms` Gesamtzeit
   - `180.435` dirty blocks
   - `55.693` read blocks
   - `783,65 MB` WAL

2. `meter_cumulative_readings` UPSERT
   - `12.526` Calls
   - `267.164 ms` Gesamtzeit
   - `97.780` dirty blocks
   - `349,26 MB` WAL

3. `meter_power_readings_5min_bridge` UPSERT
   - `1.133` Calls
   - `265.849 ms` Gesamtzeit
   - `91.272` dirty blocks
   - `255,79 MB` WAL

4. `meter_power_readings_5min` UPSERT
   - `1.133` Calls
   - `301.224 ms` Gesamtzeit
   - `89.246` dirty blocks
   - `251,70 MB` WAL

5. `bridge_raw_samples` INSERT
   - `5.665` Calls
   - `287.958 ms` Gesamtzeit
   - `70.790` dirty blocks
   - `175,02 MB` WAL

6. `refresh_meter_period_totals_5min(...)`
   - `1.146` Calls
   - `8.995.586 ms` Gesamtzeit
   - `36.270` dirty blocks
   - `27.115` read blocks
   - `152,79 MB` WAL
   - läuft alle 5 Minuten aktiv per Cron

### Letzte 8 Stunden: belegte Datenmenge

Über tatsächliche Tabellen-Zeitstempel:

- `bridge_raw_samples`: `18.015` neue Roh-Samples
- `meter_power_readings`: `8.439` neue Leistungswerte
- `meter_cumulative_readings`: `4.782` neue Zählerstände
- `meter_power_readings_5min`: `2.394` 5-Minuten-Zeilen
- `meter_power_readings_5min_bridge`: `2.394` 5-Minuten-Zeilen
- `storage_soc_readings`: `1.015` SOC-Zeilen
- `ocpp_meter_samples`: `480` Samples
- `gateway_sensor_snapshots`: `5` Snapshots

### Eindeutig identifizierte Quellpfade

**Loxone WS Bridge / Bridge Aggregator**

`bridge_raw_samples` in den letzten 8 Stunden:

- Tenant `Stadt Steinfurt`, Miniserver `504F94A22D9C`: `11.896` Samples
- ohne Tenant-Zuordnung, Miniserver `504F94A29BA4`: `3.521` Samples
- Tenant `Stadt Steinfurt`, Miniserver `504F94D107EE`: `2.252` Samples
- Tenant `Stadt Steinfurt`, Miniserver `504F94A2BAA2`: `406` Samples

**Polling/API-Pfade für Leistungswerte**

Top-Zähler in `meter_power_readings` letzte 8 Stunden:

- Tenant `ESBGmbH`, `ESB Zuleitung via Shelly`: `985` Werte
- Tenant `ESBGmbH`, `ESB Gesamtleistung PV-Ertrag`: `985` Werte
- Tenant `ESBGmbH`, `Fronius 1 API Connector PV`: `984` Werte
- Tenant `ESBGmbH`, `Fronius 2 API Connector PV`: `984` Werte
- Mehrere Shelly/Loxone-Test-/Aktorkanäle mit ca. `465–479` Werten

Das entspricht nicht „ein paar Statusupdates“, sondern kontinuierlicher Zeitreihen-Schreiblast.

### Aktive Cron-Jobs, die den Effekt verstärken

- `bridge-aggregator-every-5min`: alle 5 Minuten aktiv
- `refresh-meter-period-totals-5min`: alle 5 Minuten aktiv
- `snapshot-charge-point-uptime`: alle 5 Minuten aktiv
- `monitoring-collect-5min`: alle 5 Minuten aktiv
- `compact-meter-power-readings-daily`: täglich aktiv

### Zusätzlich belegter Designfehler im aktuellen Aggregator

`supabase/functions/bridge-aggregator/index.ts` schreibt dieselben aggregierten 5-Minuten-Buckets doppelt:

1. in `meter_power_readings_5min_bridge`
2. in `meter_power_readings_5min`

Danach markiert er alle Rohsamples in `bridge_raw_samples` per `processed_at`-Update als verarbeitet.

Damit erzeugt ein Bridge-Lauf mindestens drei Write-Klassen:

```text
bridge_raw_samples INSERT
→ meter_power_readings_5min_bridge UPSERT
→ meter_power_readings_5min UPSERT
→ bridge_raw_samples UPDATE processed_at
→ refresh_meter_period_totals_5min liest/updated daraus alle 5 Minuten Periodentotale
```

Das ist der belegte IO-Treiber.

## Bewertung

Die bisherigen Fixes konnten das IO-Budget nicht sichtbar senken, weil sie offenbar nicht den größten verbleibenden Write-/WAL-Pfad abgeschaltet haben:

- Die Rohdaten werden weiter kontinuierlich geschrieben.
- Die Bridge-Aggregation schreibt weiter doppelt.
- Die Perioden-Reaggregation läuft weiter alle 5 Minuten und verarbeitet Tages-/Monats-/Jahreswerte wiederholt.
- `meter_power_readings_5min` hat nur `48.225` Live-Zeilen, aber `590 MB` Gesamtgröße, davon `357 MB` Indexgröße. Das ist für diese Zeilenzahl sehr groß und zeigt Index-/Upsert-/Bloat-Druck auf der zentralen Aggregat-Tabelle.

## Plan zur eindeutigen Behebung

### 1. Sofortmaßnahme: Bridge-Doppelschreiben stoppen

`bridge-aggregator` soll nicht mehr parallel in Schatten- und Haupttabelle schreiben.

Vorschlag:

- `meter_power_readings_5min_bridge` als Diagnose-/Schattenpfad deaktivieren.
- Nur noch `meter_power_readings_5min` beschreiben.
- Optional: per Feature-Flag/Env nur bei Debug wieder in die Bridge-Tabelle schreiben.

Erwarteter Effekt: Wegfall eines der Top-5 WAL-Verursacher (`255,79 MB` WAL im aktuellen pg_stat-Fenster).

### 2. Perioden-Reaggregation von 5 Minuten auf inkrementell ändern

`refresh_meter_period_totals_5min((current_date - interval '2 days')::date, current_date)` läuft aktuell alle 5 Minuten und aggregiert wiederholt Tages-, Monats- und Jahreswerte.

Umstellen auf:

- nur betroffene Buckets/Meter seit dem letzten Lauf aktualisieren
- keine Monats-/Jahres-Neuberechnung alle 5 Minuten
- Monats-/Jahreswerte nur täglich oder bei Monatswechsel aktualisieren
- Tageswerte maximal für „heute“ aktualisieren

Erwarteter Effekt: Reduktion des größten Gesamtzeit-Verursachers (`8.995.586 ms`) und zusätzlicher WAL-/Dirty-Block-Last.

### 3. Rohsample-Verarbeitung ohne Mass-UPDATE umbauen

Aktuell werden Rohsamples nach der Aggregation per `processed_at` aktualisiert. Das erzeugt laut `pg_stat_statements` zusätzlich:

- `1.133` Calls
- `96.404 ms`
- `143,59 MB` WAL
- über `1.116.237` WAL records

Umbauoptionen:

- statt `processed_at`-Update mit `last_processed_id` je Worker/Link arbeiten
- oder Rohsamples direkt zeitbasiert aggregieren und anschließend per Cleanup entfernen
- oder Rohsamples nur noch bei Debug speichern, wenn 5-Minuten-Aggregate ausreichen

### 4. High-frequency Polling/Shelly/Loxone begrenzen

Für die Top-Zähler wird aktuell ca. minütlich geschrieben. Für Dashboard-/Energieauswertung reicht häufig:

- Power-Zeitreihe: 5-Minuten-Aggregate
- Live-Wert: Snapshot-Tabelle oder Realtime-Status, nicht historische INSERT-Zeile pro Minute
- kumulative Zählerstände: nur bei Wertänderung über Schwelle oder maximal alle 5 Minuten

Konkrete Änderung:

- `meter_power_readings` für Polling-Pfade nicht mehr minütlich als Historie befüllen, sondern direkt in 5-Minuten-Aggregate oder Snapshot schreiben.
- `meter_cumulative_readings` mit Delta-Guard und Zeit-Guard absichern.
- SOC-Werte nur speichern, wenn SOC geändert oder Mindestintervall erreicht ist.

### 5. Index-/Bloat-Analyse und Bereinigung für `meter_power_readings_5min`

Belegt:

- `meter_power_readings_5min`: `48.225` Live-Zeilen
- Gesamtgröße: `590 MB`
- Indexgröße: `357 MB`
- ungenutzte Indizes:
  - `meter_power_readings_5min_tenant_meter_bucket_idx`: `177 MB`, `idx_scan = 0`
  - `meter_power_readings_5min_pkey`: `73 MB`, `idx_scan = 0`

Nächste technische Prüfung vor Migration:

- prüfen, ob die ungenutzten Indizes redundant sind
- nur nicht benötigte Zusatzindizes entfernen
- Primärschlüssel nicht blind entfernen
- danach gezielte Indexstruktur für tatsächliche Query-Patterns behalten

### 6. Monitoring-Validierung nach Umsetzung

Nach Umsetzung nicht anhand der UI-Anzeige allein bewerten, sondern anhand messbarer Gegenprobe:

- `pg_stat_statements` WAL-Ranking erneut lesen
- Calls/WAL der Top-Pfade vergleichen
- 8h-Zeilenraten erneut zählen
- `db_health` prüfen
- prüfen, ob der IO-Budget-Wert wegen Alert-Snapshot noch nachläuft

## Konkreter erster Implementierungsschritt

Wenn du freigibst, würde ich zuerst die zwei sichersten Hebel bauen:

1. `bridge-aggregator`: Doppelschreiben in `meter_power_readings_5min_bridge` deaktivieren.
2. `refresh_meter_period_totals_5min`: Cron-Frequenz/Logik entschärfen, sodass nicht alle 5 Minuten Tages-/Monats-/Jahreswerte breit neu geschrieben werden.

Danach erneut messen, bevor weitere Änderungen erfolgen.