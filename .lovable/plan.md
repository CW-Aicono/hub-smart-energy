## Kurze Antwort vorab

**Nein, ganz „live" werden die Tages-/Monats-/Jahreswerte nie sein** — sie sind immer aufsummierte Werte über einen Zeitraum. Realistisch erreichbar ist ein **5-Minuten-Lag** (also „fast live"), nicht sekundengenau wie der Momentan-kW-Wert.

Warum: Die WS-Bridge liefert nur Momentan-Leistung (kW). Daraus berechnet ein Hintergrund-Job (`bridge-aggregator`) alle 5 Minuten die Energie pro 5-Min-Block (kWh). Aus diesen Blöcken wird die Tagessumme aufsummiert. Schneller als 5 Min geht nicht ohne erneut die Loxone direkt zu fragen (genau das hatten wir abgeschaltet).

## Was ich in der DB gefunden habe

1. **Cron `refresh-meter-period-totals-5min` läuft bereits alle 5 Min** und würde die Tagessumme aus den 5-Min-Buckets neu berechnen.
2. **Er tut es heute aber nicht**, weil eine alte Tageszeile vom 20.06. mit `source='loxone_live'` (vom alten Polling) in `meter_period_totals` steht — und die Funktion überspringt absichtlich Tage, an denen schon eine „autoritative" Quelle (Loxone) eingetragen ist.
3. **Der `bridge-aggregator` läuft zu selten:** letzter 5-Min-Bucket im Bridge-Speicher ist um **02:10 UTC** stehengeblieben. Ohne neue Buckets kann auch die Tagessumme nicht weiterwachsen.
4. **`loxone-daily-totals-backfill` ist hart deaktiviert** (gibt 410 zurück) — der ruft Loxone direkt, das wollen wir nicht reaktivieren.

## Geplante Lösung (3 kleine Bausteine, alle ohne erneutes Loxone-Polling)

### A) `bridge-aggregator` regelmäßig laufen lassen (alle 5 Min)
Prüfen, ob ein Cron für `bridge-aggregator` existiert. Falls nein: einen `*/5 * * * *` Cron anlegen, der die rohen WS-Samples zu 5-Min-Buckets verdichtet. **Damit wachsen Tages-, Monats- und Jahressumme automatisch alle 5 Min.**

### B) Sperre für `source='loxone_live'` in `refresh_meter_period_totals_5min` lockern
Die DB-Funktion überspringt aktuell alle Tage mit `source IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')`. Nach Abschalten des HTTP-Pollings ist `loxone_live` keine „autoritative" Quelle mehr — wir entfernen es aus der Block-Liste, damit der 5-Min-Job die alten `loxone_live`-Zeilen mit der frischen `computed_5min`-Summe ersetzen kann. `loxone_backfill` und `manual` bleiben drin (die sind weiterhin autoritativ).

### C) Monats- & Jahressumme genauso befüllen
Aktuell aggregiert `refresh_meter_period_totals_5min` **nur Tageswerte**. Wir erweitern sie um `period_type='month'` und `period_type='year'`, die jeweils die `day`-Zeilen aus `meter_period_totals` aufsummieren. Damit füllen sich auch die Monats-/Jahreskacheln im Live-Werte-Screen.

### Was bewusst NICHT gemacht wird
- `loxone-daily-totals-backfill` bleibt deaktiviert (würde Loxone direkt fragen → genau das wollten wir loswerden).
- `loxone-periodic-sync` bleibt deaktiviert.
- **Gesamtzählerstand** (`meter_cumulative_readings`) bleibt erstmal leer, weil die WS-Bridge aktuell keinen absoluten Zählerstand pusht. Falls gewünscht, machen wir das in einem getrennten Schritt (Loxone-UUID des absoluten Zählers ermitteln und in die Bridge-Konfig aufnehmen).

## Erwartetes Ergebnis

- **Tagesverbrauch-Kachel:** aktualisiert sich alle 5 Min (gewünscht: live → das ist „fast live")
- **Monats- & Jahresverbrauch-Kachel:** aktualisieren sich alle 5 Min mit
- **Gesamtzählerstand:** bleibt erstmal `null` (eigene Entscheidung nötig)
- **IO-Budget:** bleibt entspannt — keine zusätzlichen Loxone-Calls, nur DB-interne Aggregation

## Technische Details

- 1 Migration: `refresh_meter_period_totals_5min` erweitern (Block-Liste reduzieren + Monat/Jahr ergänzen)
- 1 Cron-Eintrag (`pg_cron`) für `bridge-aggregator` `*/5 * * * *` (falls nicht vorhanden)
- Kein Frontend-Change nötig — `LiveValues.tsx` liest schon aus `meter_period_totals` für Tag/Monat/Jahr

Soll ich so umsetzen?
