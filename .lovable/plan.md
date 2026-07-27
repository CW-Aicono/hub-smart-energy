Drei separate Bugs auf dem Dashboard — Analyse und geplante Fixes.

## 1) Live-Leistung zeigt „Keine aktiven automatischen Hauptzähler vorhanden"

**Verifiziert:** In der DB existieren 8 aktive automatische Hauptzähler des Tenants (u. a. „Zähler Gesamtverbrauch", „Shelly Pro 3EM", „Zähler Hauptanschluss", Gas/Wasser). Das Widget `EnergyGaugeWidget` filtert `activeMeters` korrekt, blendet die Kacheln aber zusätzlich per `allowedTypes.has(et)` aus (Hook `useLocationEnergyTypesSet`). Für `locationId = null` (globale Dashboard-Sicht) darf diese Zusatzfilterung nicht greifen.

**Hypothese (zu bestätigen im Fix-Schritt):** `useLocationEnergyTypesSet(null)` liefert entweder ein leeres Set oder einen Fallback, der nicht alle relevanten Energie-Typen enthält — dadurch fällt `gaugeData` auf 0 und die Leerstands-Meldung erscheint, obwohl `activeMeters.length > 0`.

**Fix-Plan:**
- `src/hooks/useLocationEnergySources.tsx` prüfen: für `locationId=null` alle Energie-Typen der Meter des Tenants zurückgeben (oder Filter ganz überspringen).
- Alternativ im `EnergyGaugeWidget` den `allowedTypes`-Filter nur anwenden, wenn `locationId != null`.
- Kurzlogging temporär einfügen, um `activeMeters.length` vs. `gaugeData.length` bei einem Reload zu bestätigen.

## 2) PV-Prognose zeigt „Ist-Erzeugung" für den ganzen Tag (auch Zukunft)

**Verifiziert (Code):** `PvForecastWidget` ruft `fetchPvActualHourly` mit `dayStart..dayEnd` auf. Wenn für „heute" keine 5-Min-Readings vorliegen, wird über `fetchTodayCumulativeKwh` (`meter_period_totals` mit `period_type='day'`, `period_start=heute`) ein Tages-kWh geholt und dieser Wert per `estimateHourlyActualsFromDailyTotal` **über alle 24 Stunden** verteilt — inklusive der noch nicht vergangenen Stunden. Bild passt: Grüne Balken bis 22 Uhr, obwohl es 10 Uhr ist.

**Ursache:** Zwei Schritte zusammen:
1. `estimateHourlyActualsFromDailyTotal` clippt die Verteilung nicht am aktuellen Zeitpunkt.
2. Auch der „Skalierungs-Pfad" (`scaleHourlyToTotal`) darf am heutigen Tag nur bis zur aktuellen Stunde skalieren.

**Fix-Plan (`src/lib/pvActuals.ts` + Widget):**
- In `fetchPvActualHourly` bei `isToday` das Ziel-Zeitfenster auf `[startOfDay, now]` begrenzen: `forecastHours` und `rawReadings` vorher auf Stunden ≤ jetzt filtern, bevor die Gewichtsverteilung/Skalierung läuft.
- `estimateHourlyActualsFromDailyTotal(dayStr, total, weights)` um optionalen `maxHourKey` erweitern → alles danach auf 0 setzen (bzw. leerer Key).
- Legende/Label unverändert („geschätzt"), aber Balken nur bis zur aktuellen Stunde.

## 3) Custom-Widget „Temperatur & Luftfeuchtigkeit" bleibt leer

**Verifiziert (Code):** `CustomWidget` lädt Serien ausschließlich aus `meter_power_readings` (5-Min-Leistung) und `meter_period_totals` (Tagessummen). Sensor-Historie für Momentanwerte (°C, %, Batterie …) wird jedoch in `sensor_readings_raw` / `sensor_readings_5min` / `sensor_readings_hourly` / `sensor_readings_daily` gespeichert (siehe `SensorHistoryChart`). Deshalb liefert das Custom-Widget bei Sensor-Metern (device_type=sensor) 0 Punkte, obwohl Live-Werte da sind.

**Fix-Plan (`src/components/dashboard/CustomWidget.tsx`):**
- Vor dem Fetch die Ziel-Meter aus `useMeters` klassifizieren (`device_type === "sensor"` oder Einheit ∈ {°C, %, V, A, bool, on/off …}).
- Für diese Meter parallel aus den Sensor-Historien-Tabellen laden — passend zum gewählten Intervall des Widgets:
  - 24 h / kurz → `sensor_readings_raw` (Fallback `sensor_readings_5min`)
  - Tag/Woche → `sensor_readings_5min` bzw. `sensor_readings_hourly`
  - Monat/Jahr → `sensor_readings_hourly` / `sensor_readings_daily`
- Bei Sensor-Serien: keine kWh-Aggregation, sondern zeitgewichteter Mittelwert bzw. Rohwerte; Y-Achse dynamisch (°C, %, bool …), damit die Serie im Chart erscheint.
- Bool-Sensoren (An/Aus) analog zu `SensorHistoryChart` mit 0/1-Skala rendern.

## Technische Reihenfolge der Umsetzung

```text
1. useLocationEnergySources.tsx  →  Fix #1 (Gauge-Widget)
2. src/lib/pvActuals.ts           →  Fix #2 (PV-Balken beschränken)
   src/components/dashboard/PvForecastWidget.tsx (nur Weitergabe des now-Cutoffs)
3. src/components/dashboard/CustomWidget.tsx  →  Fix #3 (Sensor-Serien)
```

Nach jedem Fix: Preview neu laden, Widget prüfen (Kacheln vorhanden / PV-Balken enden bei aktueller Stunde / Temperatur-/Luftfeuchte-Serie sichtbar).