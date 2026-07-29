**Wichtige Korrektur zum vorherigen Plan (verifiziert):** Der bisher geplante 90-Tage-Cleanup hätte den Tagesverlauf vom 16.02.–ca. 30.04.2026 gelöscht. Es gibt keine andere Tabelle, die ihn hält:

| Datenquelle | Auflösung | Zeitraum |
|---|---|---|
| `meter_power_readings` (roh) | Sekunden/Minuten | nur letzte 2 Tage |
| `meter_power_readings_5min` | 5 Minuten | ab 16.02.2026 (1,88 Mio Zeilen, 431 MB) |
| `meter_daily_totals_mv` | Tag | ab 16.02.2026 |
| `meter_period_totals` | Tag/Woche/Monat | ab 2021 |

Der aktuell aktive stündliche Job `ems-cleanup-5min-hourly` würde genau das tun. **Deshalb wird er als Erstes gestoppt.**

## Neues Vorgehen: Verdichten statt Löschen — strikt nacheinander

**Garantie nach Umsetzung:** Für jeden Zähler bleibt der Tagesverlauf über die gesamte Aufzeichnung erhalten — für die letzten 90 Tage in 5-Minuten-Auflösung, für ältere Zeiträume in 15-Minuten-Auflösung. Tages-, Wochen- und Monatssummen bleiben unverändert (bis 2021 zurück). Es geht kein Tag verloren.

### Etappe 0 — Sofort: löschenden Cleanup stoppen
- `ems-cleanup-5min-hourly` deaktivieren, bevor der nächste Lauf (Minute 7) Daten entfernt.
- Kein weiterer Eingriff in dieser Etappe.

### Etappe 1 — Verdichtungsfunktion bauen und einmal testen
- Neue Funktion `compact_meter_power_readings_15min(...)`: fasst 5-Minuten-Zeilen älter als 90 Tage je Zähler zu 15-Minuten-Zeilen zusammen (`power_avg` gewichtet gemittelt, `power_max` als Maximum, `sample_count` summiert, `resolution_minutes = 15`), schreibt sie in dieselbe Tabelle und löscht anschließend nur exakt die drei Quellzeilen desselben Fensters.
- Alles in einer Transaktion pro Batch: entweder Verdichtung geschrieben **und** Quellzeilen weg, oder gar nichts.
- Sicherheitsnetz: bereits verdichtete Zeilen (`resolution_minutes = 15`) werden nie erneut angefasst; ohne erfolgreich geschriebene 15-Min-Zeile wird nichts gelöscht.
- Erster Lauf bewusst klein (ein einziger Tag), danach Stichprobe: Tagesverlauf dieses Tages im UI prüfen und Tagessumme vor/nach vergleichen.

### Etappe 2 — Rückstand schrittweise verdichten
- Ein temporärer Job `ems-compact-5min-drain`, **alle 15 Minuten**, kleine Batches (max. ~50.000 Quellzeilen pro Lauf).
- Betroffen sind ca. 898.000 Zeilen älter als 90 Tage → daraus werden ca. 300.000 Zeilen; Laufzeit über mehrere Stunden verteilt.
- Nach ca. 1 Stunde Zwischenkontrolle: Backend-Gesundheit, langsame Abfragen, Login. Bei Auffälligkeiten wird der Job sofort deaktiviert.
- Am Ende: Job entfernen.

### Etappe 3 — VACUUM auf `meter_power_readings_5min`
- Erst wenn Etappe 2 vollständig durch ist. Einmaliger `VACUUM (ANALYZE)` nachts (ca. 03:20 Uhr), kein `VACUUM FULL` (würde sperren).
- Danach Größe und tote Zeilen prüfen.

### Etappe 4 — VACUUM der kumulativen Tabellen
- Wieder erst nach grünem Ergebnis aus Etappe 3, eigener Zeitslot in der Folgenacht.

### Danach: Dauerbetrieb
- Statt des löschenden Jobs läuft künftig ein täglicher Verdichtungsjob (nachts), der neu über 90 Tage hinausgewachsene Daten auf 15 Minuten verdichtet. Es wird nie ersatzlos gelöscht.

## Kontrollpunkte
Zwischen jeder Etappe: Backend-Gesundheit, Slow-Query-Check, Login-Test. Keine zwei Etappen gleichzeitig, keine zwei Etappen im selben Nachtfenster.

## Technische Details
- Migrationen mit `cron.schedule` / `cron.unschedule`; Einmal-Jobs melden sich am Ende des eigenen SQL selbst ab.
- Der vorhandene eindeutige Index `(meter_id, bucket, resolution_minutes)` erlaubt 5- und 15-Minuten-Zeilen nebeneinander — kein Schemaumbau nötig.
- Leseseite: Abfragen, die den Tagesverlauf holen, müssen für ältere Zeiträume `resolution_minutes = 15` mitlesen statt fest auf 5 zu filtern. Betroffene Stellen (u.a. `get_power_readings_5min`, Chart-Widgets, Analytics Studio) werden in Etappe 1 mit angepasst, damit die Anzeige nahtlos umschaltet.
- Retention der Tages-/Wochen-/Monatssummen bleibt unangetastet.
