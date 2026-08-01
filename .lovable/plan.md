# Maßeinheiten Gas/Wasser vereinheitlichen

## Was ich geprüft habe

- `src/components/dashboard/EnergyChart.tsx` rechnet Gas mit `gasM3ToKWh()` um (Zeile 279-285, 350-352) — die Balken/Linien enthalten also **kWh**.
- Die Beschriftung derselben Komponente (`getUnitForPeriod`, Zeile 79-87) gibt für Gas trotzdem `m³` (Woche/Monat/Jahr) bzw. `m³/h` (Tag) aus — Titel, Y-Achse und Tooltip.
- Das erklärt den Screenshot: Chart-Tooltip „Gas: 6,66 m³", Summe der Wochenbalken ≈ 73 — und der Sankey (`SankeyWidget.tsx`) zeigt für dieselbe Woche „Gas 73,14 kWh". Es sind dieselben Zahlen, nur einmal falsch beschriftet.
- Korrekt ist also **kWh**; der Chart-Titel/Tooltip ist falsch.

Zweiter Punkt (per Datenbank-Abfrage bestätigt): Die beiden Komponenten entscheiden unterschiedlich, wann umgerechnet wird — EnergyChart nur bei `unit === "m³"`, der Sankey bei jedem Gaszähler unabhängig von `source_unit_energy`. Liefert ein Gateway bereits kWh, rechnet der Sankey doppelt um. Zusätzlich fehlt bei einigen Zählern der Brennwert, dann greift stillschweigend der Pauschalfaktor 10 statt 11,5 × 0,9636.

Dritter Punkt: Im Tageschart steht für Wasser „Liter", die Werte sind aber m³ (keine Umrechnung).

## Entscheidung (aus deiner Rückmeldung)

- Verbrauchs-/Energieanzeigen: Gas **immer in kWh**.
- Kachel „Aktuelle Werte": bleibt unverändert bei **m³** (Zählerstand wie am Gerät).

## Umsetzung

1. **Eine gemeinsame Umrechnungs-Regel** in `src/lib/formatEnergy.ts`: `resolveMeterEnergyKWh(meter, rawValue)` — Vorrang hat die Gateway-Einheit (`source_unit_energy` / `unit`): liefert das Gateway bereits kWh/Wh, wird nicht erneut umgerechnet; nur bei Volumen (m³ / m³/h) greift `gasM3ToKWh` mit Gasart, Brennwert und Zustandszahl. Wasser bleibt Volumen.
2. **EnergyChart** und **SankeyWidget** auf diesen Helper umstellen — damit fällt die mögliche Doppelumrechnung weg und beide Widgets rechnen identisch. Ebenso `useMonthlyConsumptionByType.tsx` (gleiche `unit === "m³"`-Annahme).
3. **Beschriftung korrigieren** in `getUnitForPeriod`: Gas → `kWh` (Woche/Monat/Quartal/Jahr) und `kW` (Tagesansicht, Durchfluss in Leistung umgerechnet); Wasser → `m³` bzw. `m³/h` statt „Liter". Titel, Y-Achse, Tooltip und Legende ziehen dieselbe Quelle.
4. **Live-Werte unberührt lassen**: `LiveValues.tsx` und die Kacheln zeigen weiterhin die Rohwerte in m³ bzw. m³/h; hier wird nichts umgestellt.
5. **Weitere Verbrauchsstellen angleichen**: `CustomWidget.tsx`, Berichte/Exporte und CO₂-Auswertung auf denselben Helper prüfen, damit Gas dort ebenfalls in kWh erscheint.
6. **Datenhygiene-Hinweis** in der Zählerverwaltung: Warnbadge, wenn Gateway-Einheit m³/h gesetzt ist, aber kein Brennwert hinterlegt wurde (dann rechnet das System mit dem Pauschalfaktor 10).

## Technische Details

- Neue Funktion in `src/lib/formatEnergy.ts`, Signatur `(meter: { energy_type; unit; source_unit_energy; gas_type; brennwert; zustandszahl }, value: number) => number` (Ergebnis kWh).
- Unit-Tests in `src/lib/__tests__/formatEnergy.test.ts` ergänzen: m³-Gas mit/ohne Brennwert, kWh-Gas (keine Doppelumrechnung), Wasser (unverändert).
