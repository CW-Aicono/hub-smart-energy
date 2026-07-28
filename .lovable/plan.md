## Problem

Im `MeterDetailDialog` (Live-Values → Gerätedetail) werden die Einheiten falsch abgeleitet, wenn der Zähler eine **Leistungseinheit** (z. B. `kW`) statt einer Energieeinheit (z. B. `kWh`) hinterlegt hat.

Aktuell wird aus `kW`:
- `rateUnit = "kW/h"`  (falsch: Leistung ist bereits kW, nicht kW pro Stunde)
- `energyUnit = "kW"`  (falsch: Energie muss kWh sein)

Das führt zu den im Screenshot markierten Anzeigen:
- Ø Leistung: `3,20 kW/h` → sollte `3,20 kW`
- Max: `12,23 kW/h` → sollte `12,23 kW`
- Min: `0,00 kW/h` → sollte `0,00 kW`
- Energie: `71,27 kW` → sollte `71,27 kWh`

## Ursache

In `src/components/dashboard/EnergyFlowMonitor.tsx` (ca. Zeile 1405–1416) leitet `MeterDetailDialog` die Anzeigeeinheiten aus `meterUnitRaw` ab. Die Logik erkennt nur:
- Volumeneinheiten (`m³`, `l`)
- Energieeinheiten, die auf `wh` enden (`Wh`, `kWh`, `MWh`)
- alles andere wird als generische Durchfluss-/Rate-Einheit behandelt: `rateUnit = "${u}/h"`, `energyUnit = u`

Für `u = "kW"` landet man im generischen Zweig und bekommt `kW/h` + `kW`.

## Lösung

Die Einheitenableitung um eine explizite Erkennung von **Leistungseinheiten** erweitern:

- `W`  → rateUnit `W`,  energyUnit `Wh`
- `kW` → rateUnit `kW`, energyUnit `kWh`
- `MW` → rateUnit `MW`, energyUnit `MWh`
- `GW` → rateUnit `GW`, energyUnit `GWh`
- `VA`, `kVA`, `MVA` → entsprechende VAh-Einheiten
- `var`, `kvar`, `Mvar` → entsprechende varh-Einheiten

Diese Erkennung muss **vor** dem generischen Fallback `"${u}/h"` ausgeführt werden.

## Dateien / Komponenten

- `src/components/dashboard/EnergyFlowMonitor.tsx`
  - Funktion/Block `MeterDetailDialog` → Unit-Derivation (`rateUnit`, `energyUnit`)
  - Achsenbeschriftungen und Tooltips verwenden bereits `rateUnit` / `energyUnit`, daher reicht die zentrale Fix.

## Verifikation

- Unit-Test oder manueller Check mit einem Zähler, dessen `unit = "kW"` ist:
  - KPI-Kacheln zeigen `kW` für Leistung und `kWh` für Energie.
  - Y-Achse des Leistungsverlaufs zeigt `Leistung (kW)`.
  - Y-Achse „Energie pro Stunde“ zeigt `Energie (kWh)`.

## Nicht im Scope

- Keine Änderung an der Datenhaltung oder an der Berechnungslogik von `stats.avg/max/min/totalImport/totalExport`.
- Keine Änderung an anderen Dialogen oder Widgets.