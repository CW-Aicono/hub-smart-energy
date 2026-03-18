
Ziel

Den grundlegenden Prognosefehler beheben: Die PV-Prognose liegt heute massiv unter dem realen PV-Zählerwert. Wir behandeln den PV-Zähler im System als Wahrheit und rollen den Fix als Hotfix plus Vergleichsmodus aus.

Was die Open-Meteo-Strahlungsdaten bedeuten

- `shortwave_radiation`, `direct_normal_irradiance` und `diffuse_radiation` sind keine reine “theoretische Maximalerzeugung ohne Wolken”.
- Das sind modellierte, wetterabhängige Einstrahlungswerte am Standort. Bewölkung wirkt dort bereits indirekt mit hinein.
- `cloud_cover` ist deshalb nur ein zusätzlicher Wetterindikator, nicht der eigentliche Produktionswert.
- Wenn `cloud_cover` 0 % ist, aber die Strahlungswerte zu niedrig oder falsch verarbeitet sind, bleibt auch die Prognose zu niedrig.

Was ich als wahrscheinlichste Hauptursache sehe

- Es gibt sehr starke Hinweise auf einen Fehler in der Azimut-/Sonnenwinkel-Logik im Backend.
- Die UI arbeitet mit Kompass-Azimut (`180° = Süd`), die physikalische Berechnung mischt aber sehr wahrscheinlich unterschiedliche Azimut-Referenzsysteme.
- Folge: Die direkte Sonnenkomponente wird zu klein berechnet, besonders in den produktiven Stunden.
- Das passt exakt zum beobachteten Bild:
  - realer PV-Zähler heute bereits ca. 712,6 kWh bis zum aktuellen Zeitpunkt
  - Prognose für den ganzen Tag nur ca. 428,7 kWh
  - besonders starke Unterprognose am Vormittag
- Die Abweichung ist damit sehr wahrscheinlich nicht primär “Open-Meteo liefert Mist”, sondern “wir verarbeiten die Strahlungsdaten fachlich falsch”.

Technische Indizien aus dem System

- Aktive PV-Konfiguration für AICONO Zentrale:
  - 160 kWp
  - 25° Neigung
  - 135° Azimut
  - PR 0,95
- Heute gespeicherte Prognose:
  - ca. 428,67 kWh
- Aus den Live-PV-Messwerten integrierte Ist-Erzeugung:
  - ca. 712,60 kWh
- Stündlich ist die Unterprognose besonders früh am Tag extrem, was typisch für einen Winkel-/Ausrichtungsfehler ist.

Umsetzungsplan

1. Physik-Kern korrigieren
- In `supabase/functions/pv-forecast/index.ts` die Sonnenazimut-Berechnung auf ein einheitliches Referenzsystem umstellen.
- Ziel: Sonnenazimut und Panelazimut müssen dieselbe Konvention nutzen.
- Ich würde die Berechnung explizit auf ein robustes, dokumentiertes Schema umstellen:
  - entweder komplett Nord-basiert
  - oder komplett Süd-basiert
- Zusätzlich dokumentiere ich die Konvention direkt im Code, damit der Fehler nicht wieder entsteht.

2. Legacy-vs-Fix Vergleich einbauen
- Für den Vergleichsmodus den alten Rechenweg parallel weiter berechnen, aber nur als Referenz.
- Die Antwort der Forecast-Funktion erhält zusätzlich:
  - `legacy_estimated_kwh`
  - `corrected_estimated_kwh`
  - optional `legacy_poa_w_m2` und `corrected_poa_w_m2`
- So sehen wir pro Stunde direkt, wie stark der Bug den Ertrag gedrückt hat.

3. Forecast-Speicherung erweitern
- Die Tabelle `pv_forecast_hourly` um Vergleichsfelder erweitern, damit wir mehrere Tage sauber vergleichen können.
- Sinnvolle Felder:
  - `legacy_estimated_kwh`
  - `corrected_estimated_kwh`
  - optional Debugfelder wie `poa_w_m2`, `dni_w_m2`, `dhi_w_m2`
- Dadurch wird der 7-Tage-Vergleich belastbar und nicht nur “live im Moment”.

4. UI-Vergleichsmodus ergänzen
- In
  - `src/hooks/usePvForecast.tsx`
  - `src/components/dashboard/PvForecastWidget.tsx`
  - `src/components/locations/PvForecastSection.tsx`
  eine Vergleichsansicht ergänzen:
  - bisherige Prognose
  - korrigierte Prognose
  - Ist-Erzeugung aus PV-Zähler
- Für heute und historische Tage soll sichtbar werden:
  - Alt-Prognose
  - Neu-Prognose
  - Ist
  - Abweichung in %
- So kann man den Fix fachlich sofort verifizieren.

5. Vergleich gegen PV-Zähler als Qualitätsmaß
- Die Bewertung des Fixes erfolgt nicht gegen `cloud_cover`, sondern gegen den zugeordneten PV-Zähler.
- Ich würde zusätzlich eine einfache Gütekennzahl anzeigen:
  - Tagesabweichung Alt vs. Ist
  - Tagesabweichung Neu vs. Ist
- Ziel: sichtbar machen, dass der Fix die Prognose systematisch näher an die Realität bringt.

6. Auto-PR nur auf korrigierter Basis weiterverwenden
- Die automatische PR-Nachkalibrierung darf nur noch mit der korrigierten Physik arbeiten.
- Sonst kompensiert PR einen Rechenbug und verschleiert die echte Ursache.
- Im Hotfix würde ich daher prüfen, ob PR-Neuberechnung vorübergehend ausgesetzt oder auf die korrigierte Variante umgestellt werden sollte.

Betroffene Stellen

- Backend:
  - `supabase/functions/pv-forecast/index.ts`
- Frontend:
  - `src/hooks/usePvForecast.tsx`
  - `src/components/dashboard/PvForecastWidget.tsx`
  - `src/components/locations/PvForecastSection.tsx`
- Datenbank:
  - Migration für Vergleichsfelder in `pv_forecast_hourly`

Erwartetes Ergebnis

- Die Prognose basiert auf korrekt verarbeiteten Strahlungsdaten.
- Die starke Unterprognose sollte deutlich reduziert werden.
- Wir können alte und neue Berechnung direkt gegen den PV-Zähler vergleichen.
- `cloud_cover` bleibt nur Diagnosehilfe; die eigentliche Fehlerursache wird im Rechenkern behoben.

Kurzantwort auf deine Fachfrage

- Nein: Die Open-Meteo-Strahlungsdaten zeigen nicht nur eine wolkenfreie Potenzialerzeugung.
- Sie sind bereits wetterbeeinflusste Einstrahlungsprognosen.
- Der aktuelle Verdacht ist deshalb: nicht die Datenquelle allein ist falsch, sondern unsere Umrechnung dieser Strahlungsdaten in PV-Ertrag.

Technische Priorität

1. Azimut-/Sonnenwinkel-Hotfix
2. Parallelvergleich alt vs. neu
3. UI-Vergleich mit PV-Zähler
4. Danach erst Feintuning an PR/KI
