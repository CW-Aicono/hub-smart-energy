# Witterungsbereinigung: Warmwasser-Anteil korrekt behandeln

## Problem
Der komplette Gas-/Wärmeverbrauch fließt aktuell in die Formel `Q_norm = Q_ist · HDD_ref / HDD_ist`. In Sommermonaten sind die HDD nahe null, der WW-Sockel wird dadurch mit einem sehr großen Faktor hochskaliert und erzeugt die im Screenshot sichtbaren, unplausibel hohen "Bereinigt"-Werte (z. B. Juni mit fast keiner Heizung, aber ~18 MWh bereinigt).

## Lösungsansatz (gemäß Ihrer Auswahl)
**Kombiniert: Sommer-Baseline automatisch, manuelle Override-Möglichkeit je Standort.**

Formel neu:
```text
WW_monat        = Warmwasser-Sockel pro Monat (temperaturunabhängig)
Q_heiz_ist      = Q_ist − WW_monat
Q_heiz_norm     = Q_heiz_ist · HDD_ref / HDD_ist       (nur wenn HDD > 0)
Q_norm_gesamt   = Q_heiz_norm + WW_monat
```

### Bestimmung des WW-Sockels
1. **Manueller Override** am Standort (Vorrang, falls gesetzt):
   - `hot_water_via_gas` (bool)
   - `hot_water_gas_kwh_year` (kWh/a) **oder** `hot_water_gas_share_pct` (% des Jahresverbrauchs)
2. **Sommer-Baseline (Default)**: dynamisch alle Monate mit `HDD_monat < 50 Kd/Monat` sammeln, deren Mittelwert = `WW_monat`. Fällt keine Basis an (< 2 Monate), Fallback = 12 % des Jahresverbrauchs (grober Erfahrungswert für Gas-Kombitherme).

Sockel wird pro Standort und Jahr berechnet, dann monatlich abgezogen (nie mehr als der tatsächliche Verbrauch des jeweiligen Monats).

## Umsetzung

### 1. Datenbank (Migration)
Spalten in `public.locations` hinzufügen:
- `hot_water_via_gas boolean default false`
- `hot_water_gas_share_pct numeric` (0–100, nullable)
- `hot_water_gas_kwh_year numeric` (nullable)

### 2. Kern-Logik
`src/lib/report/weatherCorrection.ts`:
- `estimateHotWaterBaselineKwhPerMonth(monthly: {kwh:number, hdd:number}[], {hddThreshold=50, fallbackShare=0.12})`
- `normalizeHeatConsumptionWithBaseline(actualKwh, hdd, wwBaselineKwh, hddRef)`

Analoge Anwendung im Backend nicht nötig (wird clientseitig gerechnet).

### 3. Hook-Anpassung
`src/hooks/useWeatherNormalization.tsx`:
- Standort-Overrides mitladen.
- Für jeden Standort separat WW-Sockel bestimmen, monatlich subtrahieren, normalisieren, addieren.
- Ergebnis pro Monat aufsummieren.
- Zusätzliche Rückgabewerte: `hotWaterBaselineKwhPerMonth`, `hotWaterSourcePerLocation` (`"manual" | "summer-baseline" | "fallback"`).

`src/components/report/WeatherCorrectionSection.tsx` (Jahres-Aggregat im Report):
- Nutzt neuen Helper analog; bei nur-Jahres-Auflösung kommt der Fallback (12 %) zum Tragen bzw. der Override.

### 4. UI
- **Widget** `WeatherNormalizationWidget.tsx`: dritte KPI-Karte "Warmwasser (geschätzt)" mit kWh/a und Quelle (Badge: *Sommer-Baseline* / *Manuell* / *Fallback*). Info-Tooltip an der Überschrift ergänzen ("WW-Sockel wird vor der Bereinigung abgezogen …").
- **Standort-Formular**: neuer Abschnitt "Warmwasserbereitung":
  - Toggle "Warmwasser über Gas"
  - bei aktiv: zwei sich gegenseitig ausschließende Felder "Jahresverbrauch WW (kWh)" oder "Anteil am Gasverbrauch (%)".

### 5. Tests
Neue Unit-Tests in `src/lib/__tests__/weatherCorrection.test.ts`:
- Baseline aus 3 Sommermonaten korrekt gemittelt.
- Manueller Override hat Vorrang.
- Fallback greift, wenn zu wenig Sommer-Monate.
- Normalisierung im HDD=0-Monat = tatsächlicher Verbrauch (Sanity-Check).

## Nicht Teil dieses Plans
- Automatische WW-Anteils-Ermittlung aus Zirkulationszähler o. ä.
- Änderung des Heizöl/Pellets-Verhaltens über den Fallback hinaus (gleiche Logik greift, kann aber ohne Override abweichen — bewusst konservativ).
