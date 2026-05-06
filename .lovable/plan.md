## Performance-Audit Dashboard-Graphen

### Bestandsaufnahme (was bereits optimiert ist)

- `usePeriodSumsWithFallback` → Sankey, Pie, Kosten, Sustainability nutzen die schnelle Server-RPC `get_meter_period_sums_with_fallback`.
- `EnergyChart` (Energieverbrauch) und `CustomWidget` Woche/Monat/Jahr → seit der letzten Änderung auf `get_meter_daily_totals_split_with_fallback`.

### Verbleibende Bottlenecks

| # | Komponente | Problem | Auswirkung |
|---|---|---|---|
| 1 | `EnergyChart` Tag-Ansicht | `get_power_readings_5min` wird seitenweise (1000er-Pages) geholt — bei vielen Hauptzählern mehrere Roundtrips | 2–8 s Initialladung |
| 2 | `CustomWidget` Tag-Ansicht | Gleiche Pagination + zusätzlicher 15-Min-Raw-Fetch mit Pagination | 2–8 s |
| 3 | `EnergyFlowMonitor` | Nutzt altes `get_meter_daily_totals` (ohne Fallback) → heutiger Tag fehlt, Werte erscheinen erst nach Mitternachts-Aggregation | Falsche Anzeige + langsam |
| 4 | `useDataCompleteness` (Reports) | Altes `get_meter_daily_totals`, kein Fallback | Heutiger Tag wird als „lückenhaft" markiert |
| 5 | `useLocationYearlyConsumption` | Sequentielle Schleife pro Jahr (`for year of years` mit `await`) | Bei 3 Jahren ≈ 3× Latenz statt parallel |
| 6 | `pvActuals.ts` | Paginierte `meter_power_readings` Abfrage | Bei großen Zeiträumen viele Roundtrips |

### Geplante Änderungen

**1. Neue Server-RPC `get_meter_daily_totals_with_fallback`** (Migration)
- Kombiniert wie bei der Split-Variante: archivierte Tagessummen aus `meter_period_totals` + 5-Min-Fallback nur für fehlende Tage (typischerweise heute).
- Gibt `meter_id, day, total_value` zurück (kompatibel zur alten Signatur).

**2. `EnergyFlowMonitor.tsx`**
- `get_meter_daily_totals` → `get_meter_daily_totals_with_fallback`.
- Damit werden auch heutige Werte korrekt angezeigt, ohne Wartezeit.

**3. `useDataCompleteness.tsx`**
- Wechsel auf neue RPC, damit Lückenanalyse den heutigen Tag korrekt einschließt.

**4. `EnergyChart` und `CustomWidget` Tag-Ansicht**
- Pagination entfernen (eine einzige RPC-Anfrage). Die 5-Min-Daten für einen Tag mit ein paar Hauptzählern liegen weit unter dem 1000-Zeilen-Default — die Schleife macht im Schnitt 1–2 unnötige Roundtrips. Falls > 1000 Zeilen erwartet (sehr viele Zähler), Limit explizit auf 5000 setzen.
- `CustomWidget`: 15-Min-Raw-Pagination ebenfalls auf einen Single-Call mit `limit(2000)` reduzieren.

**5. `useLocationYearlyConsumption.tsx`**
- Schleife durch `Promise.all(years.map(...))` ersetzen → alle Jahre parallel laden.

**6. `pvActuals.ts`**
- Pagination der `meter_power_readings`-Abfrage durch Single-Call mit hartem Limit ersetzen (gleiche Logik wie EnergyChart).

**7. React-Query-Caching vereinheitlichen**
- Bei `EnergyChart` und `EnergyFlowMonitor` (beide nutzen noch `useEffect` + `useState`) auf `useQuery` mit `staleTime: 5 min` und `placeholderData: keepPreviousData` umstellen, damit Periodenwechsel keinen Blank-State erzeugt und nicht jedes Mal neu gefetcht wird.

### Erwartete Wirkung

| Sicht | Vorher | Nachher |
|---|---|---|
| Energieverbrauch Tag | 2–8 s | < 1 s |
| Energieverbrauch Woche/Monat | bereits 1–2 s | unverändert |
| EnergyFlowMonitor heute | zeigt 0 / 30 s | < 1 s mit korrekten Werten |
| Custom Widget Tag | 2–8 s | < 1 s |
| Reports Datencompleteness | langsam | < 1 s, korrekt |
| Mehrjahres-Vergleich | n × Latenz | 1× Latenz |

### Out of scope

- Recharts-Render-Performance (Chart.js/Canvas-Wechsel) — derzeit kein Engpass laut Profilen.
- ChargingApp-Charts (separate Domäne, keine Beschwerden).
- ArbitrageAi/Anomaly-Widgets (eigene RPCs, schnell).
