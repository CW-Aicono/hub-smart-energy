## Problem (verifiziert)

Im Geräte-Detail-Dialog (`EnergyFlowMonitor.tsx`, Chart „Energie pro Stunde") wird der Einspeise-Balken nur gerendert, wenn `stats.bidirectional` wahr ist. `bidirectional` ist nur dann `true`, wenn die Leistungsreihe **sowohl** Werte < 0 **als auch** Werte > 0 enthält (Zeile 1753).

Beim gezeigten Zähler ist die Leistung durchgehend negativ (Ø −51,64 kW) → `bidirectional = false` → nur der „Bezug"-Balken (`import`, überall 0) wird gezeichnet. Ergebnis: leeres Diagramm, obwohl die KPI korrekt −1.223,27 kWh ausweist.

## Lösung

In `src/components/dashboard/EnergyFlowMonitor.tsx`:

1. **Neues Kriterium statt `bidirectional` für die Chart-Darstellung**: aus `energyBuckets` ableiten, ob es Import-Anteile (`totalImport > 0`) und/oder Export-Anteile (`totalExport > 0`) gibt.
2. **Bar-Rendering**:
   - Import-Balken nur rendern, wenn `totalImport > 0`.
   - Export-Balken (`exportNeg`, grün HSL 152 55% 42%) rendern, wenn `totalExport > 0` — unabhängig von `bidirectional`.
   - Nulllinie (`ReferenceLine y={0}`) anzeigen, sobald beide Anteile vorhanden sind.
3. **Legende/Tooltip**: unverändert („Bezug" / „Einspeisung"), aber Legende zeigt dann nur die tatsächlich vorhandene Serie.
4. **Y-Achse**: bleibt bei `Math.min(0, dataMin)` / `Math.max(0, dataMax)`, sodass rein negative Werte nach unten aufgetragen werden; Tick-Beschriftung weiter als Absolutwert im deutschen Format.
5. **KPI-Kachel „Energie"**: zusätzlich bei rein einspeisenden Zählern das Label um „(Einspeisung)" ergänzen, damit das Minuszeichen erklärt ist — konsistent zum bestehenden „(Bezug/Einspeisung)".

## Technische Details

- Betroffene Stellen: Zeilen ~1989 (KPI-Label), ~2213 (ReferenceLine), ~2228–2231 (Bars).
- Keine Änderung an der Datenbeschaffung oder der Trapez-Integration (`energyBuckets`) — die Werte sind bereits korrekt getrennt in `import` / `export`.
- Keine Backend-/DB-Änderungen nötig.
