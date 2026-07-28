# Einheiten-Konsistenz für Zähler-, Sensor- und Aktor-Detailansichten

## Problem

Im `MeterDetailDialog` (Detail-Popup aus dem `EnergyFlowMonitor`, z. B. beim Klick auf eine Kachel wie „CO2 Ersparnis") stimmt die angezeigte Einheit nicht mit der konfigurierten Quell-Einheit des Zählers/Sensors überein:

- Für Gewicht/Masse (`mg`, `g`, `kg`, `t`, `kg/h`, `t/h`, `t/a`) gibt es keine Regel → es wird entweder generisch `kWh`/`kW` (Fallback) oder die Rohbezeichnung ohne Rate-Ableitung ausgegeben.
- Die KPI-Kachel „Energie" heißt weiterhin „Energie" und zeigt `kWh`, auch wenn die Datenquelle Masse liefert.
- Chart-Achsen und Tooltips zeigen „Leistung (kW)" / „Energie (kWh)" statt der medien­spezifischen Bezeichnung.

Zusätzlich fehlt bei nicht-elektrischen Medien (Wasser, Gas, Masse) eine einheitliche Umbenennung der Labels („Leistung" → „Durchfluss" bzw. „Massenstrom", „Energie" → „Volumen" bzw. „Masse").

## Umfang

Nur Frontend/Presentation. Keine DB-Migration, keine Änderung an Aggregations-Pipelines.

Betroffene Datei primär:
- `src/components/dashboard/EnergyFlowMonitor.tsx` (Funktion `MeterDetailDialog`, ab Zeile ~1374).

Kurzer Cross-Check (nur lesend, ggf. Angleichung):
- `EnergyGaugeWidget.tsx`, `CustomWidget.tsx`, `ForecastWidget.tsx`, `PieChartWidget.tsx`, `EnergyChart.tsx` → alle nutzen bereits `powerUnitForMeter` / `energyUnitForMeter` bzw. `formatEnergyByType`. Wenn dort für Masse noch Lücken bestehen, werden diese durch die Erweiterung von `src/lib/meterUnits.ts` mitgezogen.

## Neue Einheiten-Ableitung

Zentrale Ableitung in `MeterDetailDialog` (und `src/lib/meterUnits.ts`) wird um Masse ergänzt und um ein Medium/Kind-Konzept erweitert:

```text
Quell-Einheit    →  rateUnit   energyUnit   kind
kW / W / MW      →  kW / …     kWh / …      power
kWh / Wh / MWh   →  kW / …     kWh / …      power
m³ / m³/h        →  m³/h       m³           volume
l  / l/min       →  l/h        l            volume
kg / kg/h        →  kg/h       kg           mass
g                →  g/h        g            mass
t  / t/h / t/a   →  t/h        t            mass
°C / %H / V / A  →  = unit     = unit       sensor
bool             →  Ein/Aus    Ein/Aus      boolean
sonst            →  = unit     = unit       generic
```

Label-Mapping (nur DE, deutsche Zahlenformate bleiben):

```text
kind      Rate-Label     Sum-Label
power     Leistung       Energie
volume    Durchfluss     Volumen
mass      Massenstrom    Masse
sensor    Wert           Ø-Wert (Statistik)
boolean   Zustand        Betriebszeit (falls sinnvoll, sonst „–")
generic   Rate           Summe
```

## Änderungen in `MeterDetailDialog`

1. Neuen `kind`-Wert mit ableiten (im gleichen IIFE wie `rateUnit`/`energyUnit`).
2. KPI-Kacheln (Zeilen ~1905–1935):
   - „Ø Leistung" → dynamisch aus `kind`.
   - „Energie" → dynamisch aus `kind`.
3. Chart-Blöcke:
   - „Leistungsverlauf" Titel → `${rateLabel}verlauf`.
   - Y-Achsenbeschriftung `Leistung (${rateUnit})` → `${rateLabel} (${rateUnit})`.
   - Tooltip `Leistung:` → `${rateLabel}:`.
   - „Energie pro Stunde" Titel + Achse → `${sumLabel} pro Stunde`, `${sumLabel} (${energyUnit})`.
4. Fallbacks:
   - Wenn `meterEnergyType` = `wasser`/`gas` → kind=`volume`.
   - Wenn `nodeMeter` fehlt → aktuelles Verhalten (`kW`/`kWh`) beibehalten.

## Zentralisierung (klein)

In `src/lib/meterUnits.ts` neue Helper hinzufügen, damit auch andere Widgets konsistent bleiben:

```ts
export type MeterKind = "power" | "volume" | "mass" | "sensor" | "boolean" | "generic";
export function meterKindFor(m?: MeterLike | null): MeterKind
export function labelsFor(kind: MeterKind): { rate: string; sum: string }
```

`powerUnitForMeter` wird um die Masse-Einträge (`kg`, `t`, `kg/h`, `t/h`, `t/a`, `g`) ergänzt (bisher fallen sie in den „unbekannt → so belassen"-Zweig, was für Rate falsche Ausgaben liefert).

## Was nicht geändert wird

- Keine Anpassung der Datenpipelines, Aggregationen oder Speicherung.
- Keine Umrechnung zwischen Massen-Einheiten (z. B. `g` → `kg`).
- Keine Änderung an CO2-Faktoren oder ihrer Speicherung.
- Keine neuen Übersetzungsschlüssel; DE-only Labels wie bisher.

## Verifikation

- Manuell für je einen Zähler pro `kind` prüfen: Strom (kW), Gas/Wasser (m³/h), Masse (kg/h und t/h), Sensor (°C, V), Aktor (bool).
- Screenshot des CO2-Ersparnis-Dialogs vorher/nachher.
- `tsgo` läuft automatisch nach dem Edit.
