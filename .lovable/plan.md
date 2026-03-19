
Ziel

Historische Ist-Erzeugung in der Tagesansicht wieder sichtbar machen, obwohl für ältere Tage oft keine Rohwerte mehr in `meter_power_readings` liegen, die Tagessummen aber weiterhin in `meter_period_totals` verfügbar sind.

Wahrscheinliche Fehlerursache

- Die Tagesansicht in `src/components/dashboard/PvForecastWidget.tsx` baut `actualReadings` ausschließlich aus `meter_power_readings`.
- Für historische Tage sind diese Rohdaten teils nicht mehr vorhanden, weil sie später verdichtet/gelöscht werden.
- Die Wochenansicht funktioniert trotzdem, weil sie `get_meter_daily_totals` nutzt und damit `meter_period_totals` liest.
- Ergebnis:
  - Woche/Monat zeigt Ist-Tageswerte
  - Tagesansicht zeigt für dieselben Tage keine Ist-Werte mehr

Umsetzungsplan

1. Ist-Datenlogik vereinheitlichen
- Die Ermittlung historischer Ist-Werte in der Tagesansicht auf einen Fallback erweitern:
  - zuerst echte Rohwerte aus `meter_power_readings`
  - wenn leer: Tagessumme aus `get_meter_daily_totals`
- Damit bleibt die Live-Ansicht für heute exakt, historische Tage brechen aber nicht mehr weg.

2. Stundenwerte aus Tagessummen schätzen
- Da du „Stunden aus Summen schätzen“ gewählt hast, verteile ich die historische Tagessumme auf Stundenbalken.
- Verteilungslogik:
  - bevorzugt anhand der vorhandenen Forecast-Stundenkurve des selben Tages
  - jede Stunde erhält Anteil `forecast_hour / forecast_day_total`
  - geschätzte Ist-Stunde = `daily_actual_total * hourly_share`
- Falls die Forecast-Summe eines Tages 0 oder leer ist:
  - Fallback auf einfache Tageslichtverteilung (z. B. nur 08–18 Uhr, glockenförmig/gewichtet statt flach)

3. Kennzeichnung geschätzter Historienwerte
- Intern trenne ich zwischen:
  - echten stündlichen Ist-Werten
  - geschätzten stündlichen Ist-Werten aus Tagessummen
- In der UI soll die Tagesansicht weiter grüne Balken zeigen, aber der Tooltip/Untertitel sollte klar machen, wenn es sich um „geschätzte Verteilung aus Tagessumme“ handelt.
- So bleibt die Darstellung nützlich, ohne Rohdaten vorzutäuschen.

4. Gemeinsame Hilfsfunktionen extrahieren
- Die bisher doppelte Integrationslogik für Ist-Werte in Widget/Section ist fehleranfällig.
- Ich würde kleine gemeinsame Helper einführen für:
  - Rohdaten -> Stundenwerte
  - Rohdaten -> Tagessumme
  - Tagessumme + Forecast-Kurve -> geschätzte Stundenwerte
- Das reduziert Folgefehler zwischen Tages-, Wochen- und Detailansicht.

5. Betroffene Stellen
- `src/components/dashboard/PvForecastWidget.tsx`
  - Tagesansicht-Fallback ergänzen
  - historische Stundenwerte aus Tagessumme schätzen
  - Kennzeichnung „geschätzt“ ergänzen
- optional auch `src/components/locations/PvForecastSection.tsx`
  - aktuell ebenfalls nur Rohwerte für Ist-Vergleich
  - sollte dieselbe Historienlogik bekommen, damit beide PV-Ansichten konsistent bleiben

Technische Details

```text
Historischer Tag:
1. Lade meter_power_readings für den Tag
2. Wenn vorhanden:
   -> echte hourly actuals
3. Sonst:
   -> lade daily total via get_meter_daily_totals
   -> verteile daily total proportional auf forecast.hourly
   -> markiere Ergebnis als estimated_actuals
```

Geplantes Ergebnis

- Historische Tagesansichten zeigen wieder grüne Ist-Balken.
- Die Summe der grünen Stundenbalken entspricht der vorhandenen Tagessumme.
- Heute bleibt weiterhin live und exakt aus Rohwerten berechnet.
- Woche und Tag verwenden keine widersprüchlichen Datenpfade mehr.

Annahmen

- Die fehlenden historischen Tageswerte sind kein RLS-Problem, sondern ein Datenquellenproblem zwischen Rohwerten und verdichteten Tagessummen.
- Für den betroffenen Zeitraum existieren Forecast-Stundenwerte in `pv_forecast_hourly`, sodass die Tagessumme sinnvoll auf Stunden verteilt werden kann.
- Wenn für einzelne historische Tage keine Forecast-Stundenwerte vorliegen, wird ein neutraler Stunden-Fallback benötigt.
