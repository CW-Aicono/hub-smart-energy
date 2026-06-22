## Befund

Der 15-Min-HTTP-Sync (`loxone-periodic-sync` → `loxone-api?action=getSensors`) liest zwar **alle** relevanten Loxone-Felder vom Miniserver (`Rd`=Heute, `Rm`=aktueller Monat, `Ry`=aktuelles Jahr, `Mr`=Zählerstand, `Rlm`=Vormonat, `Rldc`=Vortag), schreibt aber in `meter_period_totals` nur:

- `period_type='day'` – gestern (`Rldc`, source=`loxone`)
- `period_type='day'` – heute (`Rd`, source=`loxone_live`)
- `period_type='month'` – **Vormonat** (`Rlm`, source=`loxone`)

**Es fehlen die Schreiboperationen für:**
- `period_type='month'` – **aktueller Monat** (`Rm`)
- `period_type='year'` – aktuelles Jahr (`Ry`)
- Zählerstand (`Mr`) als verbindliche Quelle (aktuell wird in `meter_cumulative_readings` nur `Ry`/`Rd` als Proxy gespeichert, nie der echte `Mr`-Wert)

Die Live-Karte liest `month`/`year` aus `meter_period_totals` und den Zählerstand aus dem WS-Bridge-Broadcast (`role='total'`). Solange das HTTP-Sync diese Werte nicht in die DB schreibt, hängt die Karte komplett von der WS-Bridge ab. Ist die Bridge in einem Zeitraum offline (was im Februar 2026 6 Wochen der Fall war), entstehen Lücken – genau die jetzt sichtbare Jahres-Diskrepanz (130 MWh statt 192 MWh).

Woche und Quartal bleiben weiter aus den eigenen 5-Min-Daten berechnet (nicht von Loxone geliefert) – das ist unverändert korrekt.

## Änderung

**Eine Datei betroffen:** `supabase/functions/loxone-api/index.ts` (`action=getSensors`, ab Zeile ~1042 in der Meter-Schleife).

Pro Hauptzähler zusätzlich folgende `meter_period_totals`-Upserts vorbereiten und im bestehenden Bulk-Upsert (Zeile 1190 ff., inkl. der bestehenden Change-Detection für IO-Schonung) mitsenden:

1. **Aktueller Monat** (`Rm`)
   - `period_type = 'month'`
   - `period_start = ` 1. des aktuellen Monats (Europe/Berlin)
   - `total_value = stateData.totalMonth`
   - `source = 'loxone_live'`
   - nur wenn `totalMonth != null && totalMonth >= 0`

2. **Aktuelles Jahr** (`Ry`)
   - `period_type = 'year'`
   - `period_start = ` 1. Januar des aktuellen Jahres (Europe/Berlin)
   - `total_value = stateData.totalYear`
   - `source = 'loxone_live'`
   - nur wenn `totalYear != null && totalYear >= 0`

3. **Zählerstand (`Mr`)** – separater Pfad
   - Im `cumulativeInserts`-Block (Zeile 1116) die Priorisierung ändern: **zuerst `stateData.total` (= Loxone `Mr`)**, dann erst `totalYear` als Fallback, dann `totalDay`. Source dann entsprechend `'loxone_live_total'` / `'loxone_live_year'` / `'loxone_live_day'`.
   - Damit landet alle 15 Min der echte Zählerstand in `meter_cumulative_readings`, unabhängig von der WS-Bridge.

## Sicherheits-Checks

- Beide neuen Upserts laufen durch die schon vorhandene Change-Detection (Zeile 1208–1215): wenn `total_value` und `source` unverändert → kein DB-Write, also kein IO-Mehraufwand außer 2 zusätzlichen Lesezeilen.
- `onConflict='meter_id,period_type,period_start'` bleibt unverändert; die neuen Zeilen passen in dasselbe Schema.
- Wenn der Cron-Lauf in der Sekunde nach Monats-/Jahreswechsel läuft, schreibt Loxone selbst schon den neuen `Rm`/`Ry`-Wert auf den 1. des neuen Monats – kein doppelter Eintrag möglich.
- Quelle bleibt nach Monatsende stehen, bis der nächste Lauf (vom 1. des Folgemonats) sie überschreibt. Das nächste Vormonats-Archiv (`Rlm`, source=`'loxone'`) liegt ohnehin schon im Code – beide Zeilen koexistieren, da unterschiedliche `period_start`.

## Was bewusst NICHT geändert wird

- Keine Backfill-Logik für Februar 2026 (separates Thema, kann später per einmaligem Lauf von `loxone-api?action=backfillStatistics&totalsOnly=true` erfolgen, sobald die Sperre in `loxone-daily-totals-backfill` aufgehoben wird).
- Kein Eingriff in `EnergyChart.tsx` – die Jahres-Bar im Diagramm bleibt vorerst aus 5-Min-Fallback. Sobald die `month`-Zeilen vollständig sind, kann das Diagramm in einem zweiten Schritt umgestellt werden.
- Keine WS-Bridge-Änderung.
- Woche/Quartal bleiben berechnet (Loxone liefert dafür nichts Vergleichbares).

## Erwartete Wirkung nach Deployment

- Beim nächsten 15-Min-Tick wird für jeden Loxone-Hauptzähler `Monat` und `Jahr` direkt aus dem Miniserver (`Rm`/`Ry`) in `meter_period_totals` geschrieben.
- Karte „Zähler Gesamtverbrauch" zeigt dann den von Loxone gelieferten Wert – inklusive der Tage aus Phasen ohne Bridge-Verbindung.
- Zählerstand (Mr) wird ebenfalls alle 15 Min als verbindliche Quelle abgelegt.
