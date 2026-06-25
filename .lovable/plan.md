## Problem

In der Tabelle **Messstellen** (`/meters`, Spalte „Letzter Stand") wird die Einheit aus dem Gateway-Snapshot (`sensor.secondaryUnit`, hier `kWh`) angezeigt — nicht die im Gerät hinterlegte Einheit (`m.unit`, hier `Wh`).

Auf der Karte „Aktuelle Werte" (LiveValues) wird hingegen korrekt die im Gerät konfigurierte Einheit verwendet. Daher die Diskrepanz:

- Karte: `942,56 Wh Zählerstand`
- Tabelle: `943 kWh (live)`

## Fix

Eine Zeile in `src/pages/MetersOverview.tsx` (Zeile 262):

```diff
- const unit = sensor.secondaryUnit || m.unit;
+ const unit = m.unit || sensor.secondaryUnit;
```

Damit ist die in der Gerätekarte hinterlegte Einheit die Quelle der Wahrheit — konsistent mit der „Aktuelle Werte"-Anzeige. Der Wert selbst bleibt unverändert (kommt unverändert vom Gateway).

## Scope

- Nur diese eine Zeile.
- Keine Werte-Umrechnung, kein anderes Verhalten.
- Kein DB/Backend-Eingriff.
