
# Loxone API: Korrekte State-Abfrage pro Control-Typ

## Problem
Die Edge Function erkennt viele Loxone-Control-Typen nicht korrekt und fragt daher falsche oder nutzlose States ab (z.B. `jLocked` statt des eigentlichen Messwerts). Das betrifft insbesondere:
- **EFM, EnergyManager2, Fronius** werden nicht als Energie-Controls erkannt
- **Meter**-Typ bekommt keinen Sekundaerwert (`total`)
- Fallback greift oft auf `jLocked` zurueck (nutzlos)

## Loesung

### Aenderungen an der Edge Function (`supabase/functions/loxone-api/index.ts`)

**1. Erweiterte Typ-Erkennung durch eine State-Mapping-Tabelle**

Statt der einfachen `isEnergyMonitor`-Funktion wird eine kontrolltyp-spezifische Mapping-Tabelle eingefuehrt:

```text
Control-Typ       | Primaer-State  | Einheit | Sekundaer-State | Sekundaer-Einheit
------------------|----------------|---------|-----------------|------------------
Meter             | actual         | kW      | total           | kWh
EFM               | Ppwr           | kW      | Gpwr            | kW
EnergyManager2    | Gpwr           | kW      | Ppwr            | kW
Fronius           | consCurr       | kW      | prodCurr        | kW
InfoOnlyAnalog    | value          | (auto)  | -               | -
InfoOnlyDigital   | active         | -       | -               | -
Pushbutton        | active         | -       | -               | -
TextState         | textAndIcon    | -       | -               | -
```

**2. "jLocked" aus Fallback-Logik ausschliessen**

Bei der Fallback-Suche nach dem ersten verfuegbaren State wird `jLocked` uebersprungen, da es nur ein Lock-Indikator ist und keinen Messwert darstellt.

**3. Verbesserte Typ-Erkennung fuer Sensor-Kategorie und Einheit**

Die Typ-Erkennung (`sensorType` und `unit`) wird erweitert, um die neuen Control-Typen korrekt zuzuordnen:
- `EFM` -> Typ "power", Einheit "kW"
- `EnergyManager2` -> Typ "power", Einheit "kW"
- `Fronius` -> Typ "power", Einheit "kW"
- `Meter` -> Primaer "kW" (actual = Momentanleistung), Sekundaer "kWh" (total = Zaehlerstand)

**4. Meter-Typ: Sekundaerwert `total` immer abfragen**

Fuer alle `Meter`-Controls wird neben `actual` auch der `total`-State abgefragt und als Sekundaerwert angezeigt (Zaehlerstand in kWh).

### Technische Details

Die zentrale Aenderung ist eine neue Funktion `getStateMapping(controlType, availableStates)`, die anhand des Control-Typs und der verfuegbaren States bestimmt, welche States als Primaer- und Sekundaerwert abgefragt werden sollen:

```text
function getStateMapping(type, states):
  1. Pruefe exakten Typ gegen Mapping-Tabelle
  2. Wenn Treffer: verwende definierte Primaer-/Sekundaer-States
  3. Wenn kein Treffer: Fallback auf Prioritaetsliste
     (value, actual, position, level, brightness, temperature)
  4. "jLocked" wird nie als Fallback verwendet
```

Die Aenderungen betreffen ausschliesslich die Edge Function. Am Frontend (SensorsDialog) sind keine Aenderungen noetig, da es bereits Primaer- und Sekundaerwerte darstellen kann.

### Erwartetes Ergebnis

Nach der Aenderung sollten alle 66 Controls korrekte Werte anzeigen:
- ~42 Meter-Controls: Momentanleistung (kW) + Zaehlerstand (kWh)
- EFM: Produktionsleistung (Ppwr) + Netzeinspeisung (Gpwr)
- EnergyManager2: Netzleistung (Gpwr) + Produktionsleistung (Ppwr)
- Fronius: Verbrauch (consCurr) + Produktion (prodCurr)
- InfoOnlyAnalog: Aktueller Wert
- InfoOnlyDigital/Pushbutton: Ein/Aus Status
