# Maßeinheiten Gas/Wasser vereinheitlichen

## Was ich geprüft habe

- `src/components/dashboard/EnergyChart.tsx` rechnet Gas mit `gasM3ToKWh()` um (Zeile 279-285, 350-352) — die Balken/Linien enthalten also **kWh**.
- Die Beschriftung derselben Komponente (`getUnitForPeriod`, Zeile 79-87) gibt für Gas trotzdem `m³` (Woche/Monat/Jahr) bzw. `m³/h` (Tag) aus — Titel, Y-Achse und Tooltip.
- Das erklärt genau deinen Screenshot: Chart-Tooltip „Gas: 6,66 m³", Summe der Wochenbalken ≈ 73 — und der Sankey (`SankeyWidget.tsx`) zeigt für dieselbe Woche „Gas 73,14 kWh". Es sind dieselben Zahlen, nur einmal falsch beschriftet.
- Korrekt ist also **kWh**. Der Sankey stimmt, der Chart-Titel/Tooltip lügt.

Zweiter, unabhängiger Punkt (bestätigt per Datenbank-Abfrage): Bei den Gaszählern steht teils `unit = m³`, aber `source_unit_energy = kWh` (z. B. „Zähler Gas", „Gaszähler Produktion"). Beide Komponenten entscheiden unterschiedlich:
- EnergyChart konvertiert nur bei `unit === "m³"`,
- Sankey konvertiert bei jedem Gaszähler, unabhängig von `source_unit_energy`.

Liefert ein Gateway bereits kWh, wird dort **doppelt** umgerechnet (Faktor ~11,1). Außerdem fehlt bei mehreren Zählern der Brennwert, dann greift der Pauschalfaktor 10.

Dritter Punkt: Für Wasser zeigt der Tageschart „Liter" an, die Werte werden aber nicht von m³ umgerechnet.

## Umsetzung

1. **Eine gemeinsame Umrechnungs-Regel** in `src/lib/formatEnergy.ts` ergänzen: `resolveMeterEnergyValue(meter, rawValue)` — Vorrang hat `source_unit_energy` (kWh/Wh = bereits Energie, keine Umrechnung), nur bei m³/Volumen wird `gasM3ToKWh` angewendet. Wasser bleibt Volumen.
2. **EnergyChart** und **SankeyWidget** auf diesen Helper umstellen, damit die Doppelumrechnung verschwindet und beide Widgets identisch rechnen.
3. **Beschriftung korrigieren** in `getUnitForPeriod`: Gas → `kWh` (Zeitraum) bzw. `kW` (Tag), Wasser → `m³` bzw. `m³/h`; alternativ Wasser echt in Liter umrechnen (×1000), damit Label und Wert zusammenpassen. Titel, Y-Achse, Tooltip und Legende nutzen dieselbe Quelle.
4. **Weitere Fundstellen prüfen und angleichen**: `CustomWidget.tsx`, `LiveValues.tsx`, `useEnergyData.tsx` (dort ist Gas als Einheit `m³` hinterlegt), Exporte und Reports.
5. **Datenhygiene-Hinweis**: In der Zählerverwaltung eine Warnung anzeigen, wenn `unit = m³` gesetzt ist, aber kein Brennwert hinterlegt wurde (dann rechnet das System mit dem Pauschalfaktor 10 statt 11,5 × 0,9636).

## Rückfrage

Bei Gas: soll im Dashboard durchgängig **kWh** angezeigt werden (vergleichbar mit Strom/Wärme), oder möchtest du Gas als **m³** sehen und die kWh nur zusätzlich im Tooltip?
