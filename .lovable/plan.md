

# PV-Produktionsprognose

## Ueberblick

Eine KI-gestuetzte Solarprognose, die fuer jede Liegenschaft auf Basis von Standort-Koordinaten, Wetterdaten und historischen PV-Erzeugungswerten die erwartete Stromproduktion der naechsten 48 Stunden vorhersagt. Die Prognose wird als Dashboard-Widget, auf Liegenschaftsebene und im Arbitragehandel nutzbar gemacht.

## Datenquellen

- **Open-Meteo Solar Forecast API** (kostenlos, kein API-Key noetig): Liefert stuendliche Globalstrahlung (GHI), Direktstrahlung (DNI) und Diffusstrahlung (DHI) fuer beliebige Koordinaten. URL-Muster: `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&hourly=shortwave_radiation,direct_radiation,diffuse_radiation,cloud_cover&timezone=Europe/Berlin&forecast_days=2`
- **Standort-Koordinaten**: Bereits in der `locations`-Tabelle vorhanden (latitude, longitude)
- **Historische PV-Erzeugung**: Aus `meter_period_totals` fuer Zaehler mit energy_type "solar" oder ueber `tenant_electricity_settings.pv_meter_id`
- **KI-Veredelung**: Lovable AI (Gemini Flash) vergleicht die Strahlungsprognose mit historischen Erzeugungswerten und leitet daraus eine kalibrierte kWh-Prognose ab

## Technischer Plan

### 1. Neue Datenbank-Tabelle

```text
pv_forecast_settings (Mandanten-/Liegenschaftsebene)
  id             uuid PK
  tenant_id      uuid NOT NULL (FK tenants)
  location_id    uuid NOT NULL (FK locations)
  pv_meter_id    uuid (FK meters) -- zugeordneter PV-Zaehler
  peak_power_kwp numeric NOT NULL DEFAULT 10  -- installierte Spitzenleistung
  tilt_deg       numeric DEFAULT 30           -- Neigungswinkel der Module
  azimuth_deg    numeric DEFAULT 180          -- Ausrichtung (180 = Sued)
  is_active      boolean DEFAULT true
  created_at     timestamptz
  updated_at     timestamptz

RLS: tenant_id = get_user_tenant_id()
```

Die Prognose-Ergebnisse werden NICHT persistent gespeichert, sondern on-demand aus der API abgerufen und optional per KI kalibriert. Das haelt die Architektur schlank.

### 2. Edge Function: `pv-forecast`

Eine neue Backend-Funktion mit zwei Schritten:

**Schritt A - Strahlungsdaten holen:**
- Empfaengt `location_id` (und optional `tenant_id`)
- Liest Koordinaten und PV-Einstellungen (kWp, Neigung, Ausrichtung) aus der DB
- Ruft Open-Meteo Solar API ab (48h stuendlich)
- Berechnet eine Basis-Prognose: `estimated_kwh = GHI * peak_power_kwp * efficiency_factor`

**Schritt B - KI-Kalibrierung (optional):**
- Liest die letzten 30 Tage historische PV-Erzeugung aus `meter_period_totals`
- Sendet Strahlungsprognose + historische Daten an Lovable AI (Gemini Flash)
- KI liefert kalibrierten Korrekturfaktor und stuendliche kWh-Prognose zurueck
- Fallback: Wenn keine historischen Daten vorhanden, wird die physikalische Basisprognose verwendet

**Rueckgabe-Format:**
```text
{
  location: { name, city },
  settings: { peak_power_kwp, tilt_deg, azimuth_deg },
  hourly: [
    { timestamp, radiation_w_m2, cloud_cover_pct, estimated_kwh, ai_adjusted_kwh }
  ],
  summary: {
    today_total_kwh, tomorrow_total_kwh,
    peak_hour, peak_kwh,
    ai_confidence, ai_notes
  }
}
```

### 3. Frontend-Hook: `usePvForecast`

```text
usePvForecast(locationId: string | null)
  -> { forecast, isLoading, error, refetch }

usePvForecastSettings(locationId: string)
  -> { settings, isLoading, upsertSettings, deleteSettings }
```

- Ruft die Edge Function `pv-forecast` auf
- Cached das Ergebnis fuer 30 Minuten (staleTime)
- Refetch alle 30 Minuten

### 4. Dashboard-Widget: `PvForecastWidget`

Neues Dashboard-Widget fuer die Hauptuebersicht:

- **Kopfzeile**: "PV-Prognose" mit Sonnen-Icon, Liegenschaftsname
- **Tageszusammenfassung**: Heute X kWh / Morgen Y kWh als grosse Zahlen
- **Stuendlicher Verlauf**: Balkendiagramm (48h) mit farblicher Kodierung (gelb = Sonne, grau = bewoelkt)
- **Aktueller Status**: Geschaetzte aktuelle Leistung in kW
- **KI-Hinweis**: Kurzer Satz der KI zur Prognoseguete ("Gute Uebereinstimmung mit historischen Daten" o.ae.)

Registrierung in `useDashboardWidgets` als neuer Widget-Typ `pv_forecast`.

### 5. Integration in Liegenschafts-Detail

Auf der Seite `/locations/:id` wird ein neuer Abschnitt "PV-Prognose" eingefuegt (collapsible, wie die anderen Sektionen):

- **Einstellungen-Karte**: kWp, Neigung, Ausrichtung konfigurieren, PV-Zaehler zuordnen
- **Prognose-Chart**: 48h-Verlauf mit Ist-Erzeugung (wenn Live-Daten vorhanden) vs. Prognose
- **Tages-/Wochenuebersicht**: Zusammenfassung der prognostizierten Erzeugung

### 6. Integration in Arbitragehandel

Auf der Arbitrage-Seite (`/arbitrage`) wird ein neuer Bereich ergaenzt:

- **PV-Prognose-Overlay im Spotpreis-Chart**: Die prognostizierte PV-Leistung wird als zweite Y-Achse im bestehenden Spotpreis-Verlauf angezeigt. So sieht man auf einen Blick: "Wann ist Strom teuer UND wann produziere ich viel?"
- **Empfehlungs-Karte**: KI-generierter Hinweis wie "Heute 14-16 Uhr: Hohe PV-Erzeugung bei hohem Spotpreis - Batterie entladen empfohlen"

### 7. Modul-Zuordnung

Die PV-Prognose wird KEIN eigenes Modul, sondern als Feature innerhalb des bestehenden `energy_monitoring`-Moduls gefuehrt. Die Konfiguration erfolgt pro Liegenschaft - Mandanten ohne PV-Zaehler sehen das Feature nicht.

### 8. Sidebar / Navigation

Kein neuer Navigationseintrag noetig - die Prognose ist ueber das Dashboard-Widget und die Liegenschafts-Detailseite erreichbar.

---

## Zusammenfassung der Dateien

| Aktion | Datei |
|--------|-------|
| Migration | `pv_forecast_settings`-Tabelle + RLS |
| Neu | `supabase/functions/pv-forecast/index.ts` |
| Neu | `src/hooks/usePvForecast.tsx` |
| Neu | `src/components/dashboard/PvForecastWidget.tsx` |
| Neu | `src/components/locations/PvForecastSection.tsx` |
| Bearbeiten | `src/pages/LocationDetail.tsx` - PV-Prognose-Sektion einbinden |
| Bearbeiten | `src/pages/ArbitrageTrading.tsx` - PV-Overlay im Spotpreis-Chart |
| Bearbeiten | `src/hooks/useDashboardWidgets.tsx` - Widget-Typ registrieren |
| Bearbeiten | `src/components/dashboard/DashboardCustomizer.tsx` - Widget hinzufuegen |
| Bearbeiten | `supabase/config.toml` - `[functions.pv-forecast]` eintragen |
| Bearbeiten | `src/i18n/translations.ts` - Uebersetzungsschluessel |

