

# Fix: Fehlerhafte Verfügbarkeits-Berechnung in Statistik-Charts

## Problem

Beide Statistik-Charts (Übersicht und Einzelansicht) berechnen "Fehler"-Stunden falsch:

1. **`ChargingOverviewStats.tsx` (Zeile 70-72)**: Zählt nur `"faulted"` als Fehler, ignoriert `"offline"`. 3 von 6 Ladepunkten sind offline, werden aber als "verfügbar" gezählt → 120h statt korrekt ~48h verfügbar + ~72h Fehler.

2. **`ChargePointDetail.tsx` (Zeile 213)**: Gleicher Bug — prüft nur `cp.status === "faulted"`, nicht `"offline"`.

3. **Nur heute**: Beide Charts berechnen Fehler-Stunden nur für den aktuellen Tag. Vergangene Tage zeigen immer 0 Fehler, da kein historischer Status gespeichert wird.

## Lösung

### Schritt 1: Übersichts-Chart fixen (`ChargingOverviewStats.tsx`)

Zeile 70-72 ändern: `"offline"` und `"unavailable"` zusätzlich zu `"faulted"` als Fehlerstatus zählen.

```
// Vorher:
const errorHours = isToday
  ? chargePoints.filter((cp) => cp.status === "faulted").length * hoursInDay
  : 0;

// Nachher:
const errorCpCount = chargePoints.filter(
  (cp) => cp.status === "faulted" || cp.status === "offline"
).length;
const errorHours = errorCpCount * hoursInDay;
```

Wichtig: `errorHours` wird jetzt auch für vergangene Tage berechnet — basierend auf dem **aktuellen** Status (beste Annäherung ohne historische Daten). Ein Kommentar weist darauf hin.

### Schritt 2: Einzelansicht-Chart fixen (`ChargePointDetail.tsx`)

Zeile 213 ändern:

```
// Vorher:
const errorHours = isToday && cp && cp.status === "faulted" ? hoursInDay : 0;

// Nachher:
const errorHours = cp && (cp.status === "faulted" || cp.status === "offline") ? hoursInDay : 0;
```

### Schritt 3: Betriebszeit-KPI korrigieren (`ChargingOverviewStats.tsx`)

Die `uptimePercent`-Berechnung (Zeile 36-38) ist ebenfalls betroffen — sie zählt nur `"available"` und `"charging"` als "in Betrieb". Das ist korrekt, aber die Darstellung sollte konsistent sein.

## Einschränkung

Ohne historischen Status-Log bleibt die Fehlerberechnung für vergangene Tage eine Approximation (aktueller Status wird auf alle Tage projiziert). Eine exakte Lösung bräuchte eine `charge_point_status_log`-Tabelle — das ist ein separates Feature.

