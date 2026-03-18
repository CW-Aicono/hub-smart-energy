
Ziel: Die Wetterabfrage so angleichen, dass sie reproduzierbar zu deiner Open-Meteo-DWD-Ansicht passt und wir Abweichungen eindeutig erklären können.

Was ich im Code bestätigt habe
- Die PV-Funktion nutzt aktuell `https://api.open-meteo.com/v1/forecast` in `supabase/functions/pv-forecast/index.ts`.
- Abgefragt werden gleichzeitig:
  - `shortwave_radiation`
  - `direct_normal_irradiance`
  - `diffuse_radiation`
  - `cloud_cover`
  - `temperature_2m`
- Die Zeitzone ist hart auf `Europe/Berlin` gesetzt.
- Es wird kein expliziter DWD-Modellparameter mitgegeben.
- Deine URL verweist dagegen auf die DWD-API-Dokumentation/Ansicht mit `forecast_days=1`, `hourly=cloud_cover`, `latitude=52.09`, `longitude=7.42` und laut Seite standardmäßig `GMT+0`, wenn keine Zeitzone gesetzt ist.

Wahrscheinliche Ursache der Abweichung
- Nicht zwingend falscher Anbieter, sondern nicht exakt dieselbe Anfrage:
  - anderer Endpoint-Kontext (generischer Forecast vs. DWD-Ansicht)
  - andere Zeitzone
  - andere Variablenkombination
  - kein explizit gepinnter Modellpfad im aktuellen Backend

Geplanter Umsetzungsansatz
1. Anfrage exakt reproduzierbar machen
- Die Wetterabfrage in `pv-forecast` so umbauen, dass die verwendete Open-Meteo-Konfiguration explizit ist:
  - DWD-basierter Datenpfad
  - explizite Forecast-Länge
  - explizite Zeitzone
  - vollständige Parameterliste
- Ziel: dieselbe Anfrage soll immer dieselben Werte liefern.

2. DWD-Ansicht gegen Backend-Request spiegeln
- Eine Vergleichslogik einbauen, die für dieselben Koordinaten zwei klar benannte Request-Profile trennt:
  - „aktuelle PV-Produktionsabfrage“
  - „DWD-Cloud-Cover-Referenz wie in deiner URL“
- So sehen wir sofort, ob die Differenz an der Quelle oder an der Request-Konfiguration liegt.

3. Metadaten im Forecast mitgeben
- Im Response der PV-Funktion zusätzlich zurückgeben:
  - verwendeter Endpoint/Profilname
  - Koordinaten
  - Zeitzone
  - `forecast_days`
  - abgefragte Variablen
- Damit wird die Herkunft der Prognose im Frontend nachvollziehbar.

4. UI für Validierung ergänzen
- In `usePvForecast.tsx`, `PvForecastWidget.tsx` und `PvForecastSection.tsx` eine kleine Debug-/Infoanzeige vorbereiten:
  - „Quelle: Open-Meteo DWD“
  - verwendete Zeitzone
  - heutige `cloud_cover`-Reihe
- Das ist die schnellste Möglichkeit, künftig Screenshots direkt mit der App zu vergleichen.

5. Datenmodell nur bei Bedarf erweitern
- Aktuell speichert `pv_forecast_hourly` nur `radiation_w_m2`, `cloud_cover_pct`, `estimated_kwh`, `ai_adjusted_kwh`.
- Falls wir die Validierung dauerhaft historisch nachvollziehen wollen, würde ich danach eine gezielte Erweiterung für Request-Metadaten/Rohwerte planen.

Betroffene Stellen
- Backend:
  - `supabase/functions/pv-forecast/index.ts`
- Frontend:
  - `src/hooks/usePvForecast.tsx`
  - `src/components/dashboard/PvForecastWidget.tsx`
  - `src/components/locations/PvForecastSection.tsx`
- Optional später:
  - Migration für zusätzliche Wetter-/Request-Metadaten

Ergebnis nach Umsetzung
- Wir können exakt zeigen, ob die App dieselbe DWD/Open-Meteo-Konfiguration nutzt wie deine Referenz.
- Abweichungen durch Zeitzone oder Modellprofil werden sichtbar statt vermutet.
- Die PV-Prognose wird technisch auditierbar.
