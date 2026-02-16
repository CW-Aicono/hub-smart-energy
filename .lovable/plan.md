
# Witterungsbereinigte Verbrauchsanalyse

## Was ist das?
Die witterungsbereinigte Verbrauchsanalyse normalisiert den Energieverbrauch (insbesondere Heizung/Waerme/Gas) anhand von **Gradtagen** (Heating Degree Days). Damit werden Verbräuche verschiedener Monate/Jahre vergleichbar -- unabhängig davon, ob ein Winter mild oder streng war.

**Formel:**
```text
Bereinigter Verbrauch = (Ist-Verbrauch / Ist-Gradtage) x Referenz-Gradtage
```

## Datenquellen (bereits vorhanden)
- **Verbrauchsdaten**: Tabelle `meter_period_totals` (monatliche Summen pro Zaehler)
- **Standort-Koordinaten**: Tabelle `locations` (latitude/longitude)
- **Wetterdaten**: Open-Meteo Historical API (`/v1/archive`) -- kostenlos, kein API-Key noetig, liefert taegliche Durchschnittstemperaturen

## Umsetzungsplan

### 1. Edge Function: `weather-degree-days`
Neue Backend-Funktion, die fuer einen Standort und Zeitraum die Gradtage berechnet:
- Ruft historische Tagesdurchschnittstemperaturen von Open-Meteo ab
- Berechnet **Heizgradtage** (HGT): Fuer jeden Tag mit Mitteltemperatur unter der Heizgrenze (Standard: 15 Grad C): `HGT = Heizgrenze - Tagesmittel`
- Berechnet optional **Kuehlgradtage** (KGT) fuer Klimaanlagen-Analyse
- Gibt monatlich aggregierte Gradtage zurueck
- Cacht Ergebnisse in einer neuen DB-Tabelle, um wiederholte API-Aufrufe zu vermeiden

### 2. Datenbank: Neue Tabelle `weather_degree_days`
Cache-Tabelle fuer berechnete Gradtage:
- `location_id` (FK zu locations)
- `month` (date, erster Tag des Monats)
- `heating_degree_days` (numeric)
- `cooling_degree_days` (numeric)
- `avg_temperature` (numeric)
- `reference_temperature` (numeric, Standard 15.0)
- RLS-Policies analog zu bestehenden Tabellen

### 3. React Hook: `useWeatherNormalization`
- Laedt Verbrauchsdaten aus `meter_period_totals` (Typ: Waerme, Gas)
- Ruft Gradtage ueber die Edge Function ab
- Berechnet den bereinigten Verbrauch pro Monat
- Bestimmt Referenz-Gradtage (z.B. langjaehrer Durchschnitt oder fester DWD-Referenzwert)

### 4. Dashboard-Widget: `WeatherNormalizationWidget`
Neues Widget unter "Energiedaten" oder als Dashboard-Karte:
- **Balkendiagramm**: Vergleich Ist-Verbrauch vs. bereinigter Verbrauch (Monat fuer Monat)
- **Tabelle**: Monat, Gradtage, Ist-Verbrauch, bereinigter Verbrauch, Abweichung in Prozent
- **Filter**: Standort, Energieart (Gas/Waerme), Zeitraum, Referenztemperatur (einstellbar)
- **KPI-Karten**: Gesamtabweichung, Effizienz-Trend
- Integration in das bestehende Dashboard-Widget-System (DashboardCustomizer)

### 5. Integration
- Widget wird in der Dashboard-Konfiguration als neuer Typ `weather_normalization` registriert
- Standort-Filter wird vom globalen Dashboard-Kontext uebernommen
- Zeitraum-Synchronisierung mit den anderen Widgets

## Technischer Ablauf

```text
Browser                    Edge Function              Open-Meteo API
  |                             |                          |
  |-- GET /weather-degree-days -|                          |
  |   (lat, lon, von, bis)      |                          |
  |                             |-- Check DB-Cache --------|
  |                             |                          |
  |                             |-- GET /v1/archive ------>|
  |                             |   (daily temp_2m_mean)   |
  |                             |<-- Tagestemperaturen ----|
  |                             |                          |
  |                             |-- Gradtage berechnen     |
  |                             |-- Cache in DB            |
  |<-- Monatliche Gradtage -----|                          |
  |                             |                          |
  |-- Verbrauch + Gradtage                                 |
  |   zusammenfuehren und                                  |
  |   bereinigten Wert                                     |
  |   berechnen                                            |
```

## Einschraenkungen
- Open-Meteo Historical API liefert Daten bis ca. 5 Tage vor heute (kein Echtzeit)
- Witterungsbereinigung ist primaer fuer heizungsrelevante Energietraeger (Gas, Waerme) sinnvoll; Strom und Wasser werden optional angeboten
- Referenz-Gradtage: Als Startwert wird ein fester Wert (DWD-Klimanormale) verwendet; bei genuegend eigenen historischen Daten kann spaeter auf einen standortspezifischen Durchschnitt umgestellt werden
