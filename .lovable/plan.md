

## Plan: Multi-Array PV-Prognose pro Liegenschaft

### Kontext

Aktuell unterstützt das System genau **eine** PV-Konfiguration (Neigung, Azimut, kWp) pro Standort (`pv_forecast_settings` mit `isOneToOne: false`, aber die Abfragen nutzen `.maybeSingle()`). Bei Flachdächern mit Panels in mehreren Himmelsrichtungen (z.B. Ost/West-Aufständerung) ist das unzureichend.

### Ansatz: Mehrere PV-Teilanlagen pro Standort

Ja — der sauberste Ansatz ist, mehrere Einträge in `pv_forecast_settings` pro `location_id` zuzulassen und jeder Teilanlage einen eigenen Namen, Neigung, Azimut und kWp zu geben. Die Prognosen werden einzeln berechnet und dann summiert.

### Änderungen

#### 1. Datenbank-Migration
- Spalte `name` (text, default `'Anlage 1'`) zu `pv_forecast_settings` hinzufügen
- Bestehender UNIQUE-Constraint auf `(location_id)` entfernen (falls vorhanden), sodass mehrere Zeilen pro Standort möglich sind
- Bestehende Einträge erhalten automatisch den Default-Namen

#### 2. Backend: Edge Function `pv-forecast`
- Statt `.maybeSingle()` → `.select("*").eq("is_active", true)` → **Array** aller aktiven Teilanlagen laden
- Für jede Teilanlage separat die Open-Meteo GTI-API mit individuellem Neigung/Azimut aufrufen
- Stündliche kWh-Werte aller Teilanlagen **summieren** → ein kombiniertes `hourly[]`-Array zurückgeben
- Zusätzlich ein `arrays`-Feld mit den Einzelergebnissen zurückgeben (für Detail-Ansicht)
- Performance-Ratio-Kalibrierung pro Teilanlage beibehalten

#### 3. Frontend: Settings-UI (`PvForecastSection.tsx`)
- Statt eines einzelnen Formulars → **Liste** von Teilanlagen mit Hinzufügen/Löschen-Buttons
- Jede Teilanlage zeigt: Name, kWp, Neigung, Azimut, Zähler-Zuordnung, Aktiv-Schalter
- "Teilanlage hinzufügen"-Button erstellt einen neuen Eintrag
- Löschen-Button mit Bestätigungsdialog

#### 4. Frontend: Hook `usePvForecast.tsx`
- `usePvForecastSettings` liefert ein **Array** statt ein einzelnes Objekt
- `upsertSettings` wird pro Teilanlage aufgerufen
- Neue Mutation `deleteSettings` zum Entfernen einer Teilanlage

#### 5. Frontend: Prognose-Anzeige
- Summen-Kacheln (Heute/Morgen) zeigen weiterhin den **Gesamtertrag**
- Im Chart: Option, die Teilanlagen als gestapelte Balken oder als Summe darzustellen
- Badge pro Teilanlage mit Name und Ausrichtung

#### 6. Dashboard-Widget & Copilot
- `PvForecastWidget` und `copilot-analysis` nutzen bereits die summierte Antwort → keine Änderung nötig, solange die API-Antwortstruktur abwärtskompatibel bleibt

### Abwärtskompatibilität
- Standorte mit nur einem Eintrag funktionieren identisch wie bisher
- Die API-Antwort behält `settings`, `hourly`, `summary` auf Top-Level (Summe) bei und ergänzt optional `arrays[]` mit den Einzeldaten

### Technische Details

```text
pv_forecast_settings
┌──────────┬─────────────┬──────┬────────┬─────────┬──────┐
│ location │ name        │ kWp  │ tilt   │ azimuth │ meter│
├──────────┼─────────────┼──────┼────────┼─────────┼──────┤
│ loc-1    │ Ost-Seite   │ 15   │ 10°    │ 90°     │ m-1  │
│ loc-1    │ West-Seite  │ 15   │ 10°    │ 270°    │ m-2  │
└──────────┴─────────────┴──────┴────────┴─────────┴──────┘

API Response (summiert):
  summary.today_total_kwh = Ost + West
  hourly[h].estimated_kwh = Ost[h] + West[h]
  arrays: [{ name: "Ost", hourly: [...] }, { name: "West", hourly: [...] }]
```

