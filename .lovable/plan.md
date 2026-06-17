## Umsetzungsplan: Loxone-Tagessummen zuverlässig & sichtbar

Ziel: Loxone bleibt Goldstandard. Schreibpfad korrigieren, Altdaten geradeziehen, Abweichungen automatisch sichtbar, fehlende Tage ehrlich als Lücke darstellen.

---

### 1) Off-by-one im Loxone-Daily-Writer fixen

Betroffen ist `supabase/functions/loxone-api/index.ts`, Block „Archive yesterday's daily total" (Zeilen 1021–1034) im periodischen Live-Sync. Dort wird `stateData.totalDayLast` unter `yesterdayStr = today−1 (Berlin)` geschrieben. Loxones „Rldc/Rldd/Rld" enthält aber den Wert des **vorletzten** abgeschlossenen Tages, sobald nach Mitternacht erneut umgeschaltet wird → CSV-Vergleich Mai 2026 zeigt konsistent Verschiebung um +1 Tag.

Änderungen:
- Datumsableitung auf **Europe/Berlin** umstellen (statt `new Date()`-Lokal des Edge-Containers): Helper `berlinDateMinusDays(n)` einführen.
- Schreiben unter `period_start = today_berlin − 2` **nur**, wenn der Sync vor Loxones „Day-Rollover-Settle" (typ. erste Minuten nach 00:00 Berlin) läuft; sonst `today_berlin − 1`. Sicherer Weg: immer den Tag verwenden, der zur Loxone-Quelle korrespondiert (siehe unten Validierung).
- Quelle vereinheitlichen: zusätzlich aus dem **Backfill-Pfad** (Stats-XML, Zeilen 1688–1710) die Tagessumme rechnen und bei Differenz > 1 % die XML-Variante als „truth" speichern (XML hat fixe lokale Zeitstempel, kein Mitternachts-Race).
- `source` getrennt halten: `source='loxone_live'` für den Live-Pfad, `source='loxone_xml'` für den XML-Backfill. Konflikt-Strategie im Upsert: `loxone_xml` überschreibt `loxone_live` (XML ist autoritativ).
- Zusätzlich: täglicher Cron `loxone-daily-totals-backfill` ruft `backfillStatistics` mit `fromDate = today_berlin − 1` und `totalsOnly=true` auf (bereits so vorhanden) — Datumsableitung dort ebenfalls auf `Europe/Berlin` umstellen und gegen das Loxone-XML validieren.

Verifikation: Nach Deploy für die Test-Liegenschaft den 14.06. prüfen — Wert muss ≈ 322 kWh sein (statt 1.421 kWh) und Mai-Summe ≈ 29.500 kWh.

---

### 2) Backfill `meter_period_totals` (Loxone-Altdaten korrigieren)

Neue Edge-Function `loxone-period-totals-repair`:
- Iteriert alle Loxone-Integrationen, alle Meter mit `source IN ('loxone','loxone_backfill','loxone_live')`.
- Für jedes betroffene `(meter_id, period_start)` lädt sie die zugehörige Loxone-Stats-XML neu (Pfad aus 1450ff.) und schreibt die korrekte Tagessumme unter dem korrekten `period_start` (XML-Zeitstempel = Berlin-lokale Zeit, ohne UTC-Verschiebung).
- Dedup-Logik: bei identischem `(meter_id, period_type, period_start, total_value)` und unterschiedlichem `source` bleibt nur der XML-Datensatz. Bei Duplikaten ohne XML-Quelle (z. B. 21./22.05. mit jeweils 927,16): der jüngere Datensatz wird gelöscht.
- Dry-Run-Modus per Query-Param `?dryRun=1` → liefert JSON mit allen geplanten Korrekturen, ohne zu schreiben. Erst nach Sichtprüfung produktiv ausführen.
- Idempotent, kann beliebig oft laufen.

Anschließend einmalig `refresh materialized view meter_daily_totals_mv` und Folge-MVs (`meter_weekly_totals`, `meter_monthly_totals`) auslösen.

---

### 3) Reconcile-View Loxone vs. 5-min

Neue Migration: View `meter_data_quality_v`.

Spalten je `(tenant_id, meter_id, day)`:
- `loxone_kwh` (aus `meter_period_totals` mit Loxone-Source)
- `five_min_kwh` (Integration aus `meter_power_readings_5min`, `bucket AT TIME ZONE 'Europe/Berlin'`, kWh = Σ power_avg × 5/60)
- `five_min_sample_count`, `five_min_coverage_ratio` (Anteil belegter 5-min-Slots an 288)
- `delta_kwh`, `delta_pct`
- `status` als Enum-Text:
  - `ok` → |delta_pct| ≤ 5 und Coverage ≥ 0,95
  - `tolerance` → 5 < |delta_pct| ≤ 15
  - `mismatch` → |delta_pct| > 15
  - `missing_loxone` → Loxone fehlt, 5-min vorhanden
  - `missing_5min` → 5-min < 0,5 Coverage, Loxone vorhanden
  - `gap` → beide fehlen

Zusätzlich Edge-Function `meter-data-quality-scan` (Cron: täglich 03:00 UTC), die die letzten 35 Tage aus dem View liest und für jedes `mismatch`/`gap` einen Eintrag in der bestehenden `monitoring_alert_rules`/`integration_errors`-Logik ablegt (sichtbar im Super-Admin-Bereich).

Erst-Iteration zeigt nur Logging — kein Auto-Repair, um Nebenwirkungen zu vermeiden.

---

### 4) UI: Tage mit fehlendem Loxone-Wert als Lücke

Frontend-Änderungen in `src/components/report/ConsumptionTrendChart.tsx` und den Dashboard-Widgets, die `meter_period_totals` / `meter_daily_totals_mv` darstellen (`CustomWidget.tsx`, `useMonthlyConsumptionByType.tsx`, `usePeriodSumsWithFallback.ts`).

- Hook `usePeriodSumsWithFallback` liest zusätzlich `status` aus `meter_data_quality_v` mit (per RPC `get_meter_daily_status(meter_id, from, to)`).
- Pro Tag wird ein `quality`-Flag ergänzt: `ok | partial | missing`.
- Chart-Rendering:
  - `missing` (Loxone fehlt, kein autoritativer Wert) → Balken als **gestreiftes Muster** (SVG-`<pattern>` mit diagonalen Linien in `hsl(var(--muted-foreground))`), Höhe 0 oder Platzhalter-Hülle.
  - `partial` (5-min < 0,95 Coverage am laufenden Tag) → gestreifter Balken in voller Höhe der bisherigen Tagessumme.
  - Tooltip: „Tagessumme unvollständig – X % der 24 h erfasst (Stand HH:MM Berlin). Wert kann nachträglich korrigiert werden."
  - Aggregations-Funktionen (Wochen/Monatssummen) markieren das Aggregat als „unvollständig", sobald ≥ 1 Tag `missing`/`partial` enthält, und zeigen einen Info-Hinweis statt einer stillen 5-min-Schätzung.
- Kein automatischer 5-min-Fallback im Tageschart. 5-min bleibt ausschließlich Validierungs-Quelle.

---

### Technische Details

Reihenfolge der Umsetzung (jeder Schritt einzeln deploy- und testbar):
1. Migration `meter_data_quality_v` + RPC `get_meter_daily_status` anlegen (read-only, keine Auswirkung auf Schreibpfad).
2. Edge-Function `loxone-period-totals-repair` mit `?dryRun=1`. Ergebnis prüfen → produktiv laufen lassen → MVs refreshen.
3. Edge-Function `loxone-api` (Live-Pfad) und `loxone-daily-totals-backfill` (Cron) auf Berlin-TZ + XML-Validierung umstellen.
4. Cron `meter-data-quality-scan` aktivieren.
5. Frontend-Anpassung der Charts/Widgets inkl. Tooltip-Texte (DE/EN/ES/NL).

Tests:
- `packages/automation-core`-Stil: neue Unit-Tests für `berlinDateMinusDays` und die XML-Tag-Zuordnung.
- Vitest für die UI-Streifen-Logik (Snapshot mit `quality='missing'`).
- Manuelle Regression: Mai-2026-CSV gegen DB nach Repair → Δ < 0,5 %.

Annahmen, die noch zu bestätigen sind (sonst halte ich an, bevor ich umsetze):
- Loxone-Stats-XML ist für alle Test-Miniserver erreichbar (Pfad `/stats/UUID_1.YYYYMM.xml`).
- Es gibt keine Tenants, die bewusst nur den Live-Wert ohne XML nutzen (z. B. wenn die Stats-Aufzeichnung im Miniserver deaktiviert ist). Falls doch, behält dieser Tenant `loxone_live` als Fallback und das UI markiert die Tage als `tolerance` statt `ok`.
