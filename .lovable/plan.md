## Diagnose: Warum Ist & Prognose so weit auseinander laufen

### 1. Ursache der zu niedrigen Ist-Werte (616,9 / 575,2 statt 953,8 kWh)

Die grünen „Ist-Erzeugung"-Balken werden NICHT aus dem PV-Zählerstand (kWh-Totalisierer) gebildet, sondern aus der Tabelle `meter_power_readings_5min` (Leistung in kW pro 5-Minuten-Bucket).

Die SQL-Funktion `aggregate_pv_actual_hourly` rechnet:

```text
actual_kwh(Stunde) = Σ  power_avg(5-Min-Bucket) × (5 / 60)
                    Bucket in Stunde
```

Solange Loxone alle 1 Minute gepollt wurde, gab es pro Stunde ~12 gefüllte Buckets → Summe ≈ tatsächlicher Ertrag.

Seit der neuen Option „Abfrageintervall 15/60 Minuten":
- Bei 15-Min-Polling existiert pro Stunde nur 1 Sample in 1 Bucket → die anderen 11 Buckets sind leer und tragen 0 kWh bei → Ergebnis ist nur noch ca. 1/3 bis 1/2 des realen Ertrags.
- Bei 60-Min-Polling sind es sogar nur 1/12.
- Zusätzlich filtert `loxone-api` Buckets mit `sample_count < 2` heraus, was die Lücken vergrößert.

Ergo: Die 616,9 kWh sind ein Mess‑Artefakt der Leistungs-Integration, nicht ein Fehler des Zählers. Die Loxone-App zeigt mit 953,8 kWh den korrekten Tageszählerstand.

### 2. Warum Hetzner (575,2) und Lovable (616,9) unterschiedlich sind

Beide Umgebungen pollen denselben Miniserver, aber jede mit eigenem Cron-Scheduler in ihre eigene Datenbank. Die Polls treffen zu unterschiedlichen Sekunden in unterschiedliche 5-Min-Buckets — also leicht unterschiedliche Sample-Mengen, gleiches Unter-Schätzungs-Problem in unterschiedlicher Ausprägung. Das ist kein Bug, sondern die zwangsläufige Folge davon, dass „1 Sample pro 15 Min" als 5-Min-Mittelwert behandelt wird.

### 3. Warum die Prognose plausibel bleibt

Die gelbe Prognose stammt aus dem GTI-Modell (Open-Meteo) und ist von den Loxone-Polls unabhängig. Deshalb wirkt das Δ jetzt riesig (+91,8 % / +47,3 % / +81,7 %), obwohl in Wahrheit die Anlage nahezu prognose-genau läuft.

---

## Lösung: Ist aus Zählerstand-Delta, nicht aus Leistung integrieren

Loxone liefert für Erzeugungszähler zwei Stat-Gruppen:
- StatsGroup 1 = „actual" (kW Leistung) → aktuelle Quelle, intervall-empfindlich
- StatsGroup 2 = „total"  (kWh Zählerstand, kumulativ) → intervall-unabhängig

Die robuste Berechnung pro Stunde wird:

```text
actual_kwh(Stunde) = Zählerstand(Stunde+1) − Zählerstand(Stunde)
```

Ein Polling-Intervall von 60 Minuten reicht, um einen Stundenwert exakt zu bestimmen, denn nur die zwei umgebenden Zählerstände werden benötigt.

### Umsetzung (Cloud-only Frontend/Backend, kein Hetzner-Code, keine Loxone-Hardware-Änderung)

1. **Neue Tabelle `meter_cumulative_readings`**
   - Spalten: `meter_id`, `tenant_id`, `reading_at timestamptz`, `kwh_total double precision`, `source text` ('loxone_live' | 'loxone_stats_total' | 'manual')
   - Unique `(meter_id, reading_at)`, RLS analog zu `meter_power_readings_5min`
   - GRANT SELECT/INSERT für authenticated, ALL für service_role

2. **`loxone-api` erweitern**
   - Bei jedem Poll zusätzlich den `Total`-Output des Erzeugungszählers lesen (im Loxone-Strukturfile als `outputs.total.uuid` vorhanden) und in `meter_cumulative_readings` upserten.
   - In `backfillStatistics` bisher übersprungene Files mit `statsGroup === 2` ebenfalls einlesen und in `meter_cumulative_readings` schreiben (für Lücken / Initialbefüllung).

3. **SQL-Funktion `aggregate_pv_actual_hourly` neu schreiben**
   - Wenn für den `pv_meter_id` Einträge in `meter_cumulative_readings` existieren, hourly_kwh aus dem Delta zwischen erstem Reading ≥ Stundenanfang und erstem Reading ≥ nächster Stunde berechnen (lineare Interpolation, falls kein Reading exakt am Stundenrand).
   - Fallback (kein Zählerstand verfügbar) bleibt die bisherige Leistungs-Integration — also keine Regression für nicht-Loxone-Zähler.

4. **Einmaliger Backfill der letzten 60 Tage**
   - `loxone-daily-totals-backfill` so erweitern, dass beim ersten Lauf nach Deployment für jede Loxone-Integration auch die `*_2.YYYYMM.xml` Stats-Files heruntergeladen werden und `meter_cumulative_readings` füllen.
   - Anschließend `aggregate_pv_actual_hourly` für 60 Tage erneut laufen lassen → Charts korrigieren sich rückwirkend.

5. **UI bleibt unverändert** — `pv_actual_hourly` wird weiterhin gelesen, nur die Quelle dahinter ist korrekt.

### Erwartetes Ergebnis

- Heute: Ist springt auf den realen Zählerwert (≈ 953,8 kWh) — unabhängig davon, ob 1, 15 oder 60 Minuten Polling.
- Hetzner und Lovable zeigen identische Ist-Summen (gleiche Zählerstände, gleiche Berechnung).
- Δ Prognose vs. Ist liegt wieder in plausiblen einstelligen Prozenten.

### Nicht enthalten (bewusst)
- Keine Änderung an Polling-Intervallen oder Loxone-Konfiguration.
- Keine Änderung an Prognose-Logik.
- Keine UI/Chart-Änderungen.
