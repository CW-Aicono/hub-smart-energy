# Langsame Anwendung nach v1.14 — Messung und Gegenmaßnahmen

## Befund (gemessen, nicht geraten)

Das Backend ist **nicht** überlastet:

- `db_health`: Datenbank up, 0 Restarts, Verbindungen 28/60, Pool 1/200, Speicher 71 %, Disk 29 %.
- `pg_stat_activity`: **1 aktive Query**, 0 wartende Sperren, keine Langläufer.
- Schreibraten der letzten 15 Minuten: `sensor_readings_raw` 13–60 Zeilen/Minute, `bridge_event_log` 4–7 Zeilen/Minute. Kein Bloat (`n_dead_tup > 50k`: keine Tabelle).

Die Langsamkeit liegt also im **Lesepfad und im Frontend**, nicht in der DB-Kapazität. Zwei konkrete Auffälligkeiten:

1. **Teure Einzel-Meter-Reads (N+1)** aus `pg_stat_statements`:
   - `sensor_readings_5min WHERE meter_id = $1 AND bucket BETWEEN …`: 240 Aufrufe, **Ø 983 ms**, max 4,9 s.
   - `meter_power_readings WHERE meter_id = $1 … ORDER BY power_value DESC`: 960 Aufrufe, **Ø 232 ms**, max 7,2 s.
   Diese Abfragen werden pro Zähler einzeln abgesetzt; bei vielen Kacheln summiert sich das zu sekundenlangen Wartezeiten im UI.

2. **Live-Pfad seit v1.14 20× häufiger**: Broadcast jetzt alle 5 s statt 60 s. In `src/pages/LiveValues.tsx` (Zeile 506 ff.) und `EnergyFlowMonitor.tsx` (Zeile 560 ff.) setzt jedes Event den kompletten State neu → Re-Render der gesamten Kachel-Liste alle 5 s. Zusätzlich läuft in `LiveValues.tsx` alle 60 s ein Reconcile mit 7 parallelen, unlimitierten Abfragen über je 60 Minuten Historie für **alle** Zähler.

Nicht bestätigt: dass v1.14 selbst DB-Last erzeugt — der Live-Push schreibt nichts. Die Verschlechterung kommt aus dem gestiegenen Render- und Reconcile-Aufwand plus den bereits vorhandenen N+1-Reads.

## Maßnahmen

### 1. Sofortentlastung Live-Pfad (Frontend)
- Broadcast-Events in `LiveValues.tsx` und `EnergyFlowMonitor.tsx` in einem Ref sammeln und nur alle 1–2 s in den React-State übernehmen (Coalescing statt Re-Render pro Event).
- Zählerkachel als memoisierte Komponente, die nur ihren eigenen Wert abonniert, damit ein geänderter Zähler nicht die ganze Liste neu rendert.

### 2. Reconcile verschlanken
- Fenster von 60 auf 15 Minuten verkürzen, `limit()` setzen und den Reconcile nur laufen lassen, wenn der Tab sichtbar ist.
- `bridge_raw_samples` aus dem Reconcile entfernen — die Tabelle wird im Live-Pfad seit v1.10 bewusst nicht mehr befüllt und liefert daher nur Altdaten.

### 3. N+1-Reads bündeln
- Die Stellen finden, die `sensor_readings_5min` und `meter_power_readings` pro Zähler abfragen, und auf eine Sammelabfrage (`in(meter_id, …)`) bzw. eine RPC mit Aggregat pro Zähler umstellen.
- Danach `EXPLAIN (ANALYZE, BUFFERS)` auf der neuen Sammelabfrage, und nur bei belegtem Bedarf einen gezielten Index ergänzen.

### 4. Verifikation
- `pg_stat_statements` zurücksetzen, 15 Minuten laufen lassen, Ø-Zeiten der beiden Ausreißer erneut messen.
- Ladezeit `/live-values` und Dashboard vorher/nachher vergleichen; `db_health` gegenprüfen.

## Technische Details

Betroffene Dateien: `src/pages/LiveValues.tsx` (Broadcast-Handler ab 506, Reconcile ab 320–470), `src/components/dashboard/EnergyFlowMonitor.tsx` (Broadcast-Handler ab 555), plus die noch zu identifizierenden Aufrufer der Einzel-Meter-Reads. Keine Worker-Änderung nötig — v1.14 bleibt bei 5 s.
