# Verlaufsgraphen: Ursache und Bereinigung

## Was tatsächlich passiert (verifiziert)

Die Rohtabelle `meter_power_readings` wird für die meisten Zähler seit der Worker-IO-Optimierung praktisch nicht mehr befüllt. Messung für heute (31.07.2026):

- `meter_power_readings`: pro Loxone-/Worker-Zähler **genau 1 Zeile** heute (alle um 06:00 UTC = 08:00 Ortszeit, ein Worker-Neustart-Burst). Zwischen 30.07. 22:00 UTC und 31.07. 06:00 UTC gar keine Zeilen.
- `meter_power_readings_5min`: für dieselben Zähler 28–40 Buckets über den Tag verteilt — die Daten sind also vollständig da, nur in der Aggregat-Tabelle.

Die Lesepfade sind nach dem Muster „nimm die Rohtabelle, und **nur wenn sie leer ist**, nimm die 5-Minuten-Buckets" gebaut. Da die Rohtabelle nicht leer ist (1 Zeile), gewinnt sie — die Kurve besteht aus einem einzigen Punkt.

Beim PV-Widget kommt erschwerend hinzu: die eine Stunde wird anschließend in `scaleHourlyToTotal` auf die autoritative Tagessumme hochskaliert. Ergebnis exakt wie im Screenshot: ein Balken um 08:00 mit 887 kWh (= Tageserzeugung), alle anderen Stunden leer.

`pv_actual_hourly` enthält für heute 0 Zeilen, der gespeicherte Pfad greift also ebenfalls nicht.

## Betroffene Stellen (gleiche Fehlerklasse)

Verlaufs-/Serien-Auswertungen (falsche Graphen):
1. `src/lib/pvActuals.ts` — PV-Prognose-Widget und `PvForecastSection` (Liegenschaften)
2. `supabase/functions/pv-forecast/index.ts` — serverseitige Ist-Aggregation, gleiches Roh-zuerst-Muster
3. `src/components/dashboard/EnergyFlowMonitor.tsx` — Detail-Charts an drei Stellen (Node-Sparkline 24 h, Detail-Dialog, Fluss-Serien)
4. `src/components/dashboard/CustomWidget.tsx` — Roh-Top-up der letzten 15 Min wird mit Aggregat gemischt
5. `src/components/dashboard/EnergyGaugeWidget.tsx` — Tages-Peak wird nur aus der Rohtabelle ermittelt (Peak damit meist falsch/zu niedrig)

Livewert-Pfade (Risiko veralteter „Jetzt"-Werte, kein Zeitfilter):
6. `EnergyGaugeWidget` Live-Wert und `PvForecastWidget` „Jetzt" lesen die jeweils letzte Rohzeile **ohne Zeitgrenze** — kann Stunden alt sein
7. `src/components/board/BoardEnergyBand.tsx`, `src/pages/LiveValues.tsx`, `DynamicDlmCard` — hier ist ein Zeitfenster gesetzt, Verhalten prüfen aber nicht zwingend ändern

Bereits korrekt (Referenzmuster): `src/lib/powerSeries.ts` → `fetchPowerSeriesAuto` / RPC `get_power_series_auto`, genutzt u. a. von `useAnalyticsData`.

## Vorgehen Schritt für Schritt

**Schritt 1 — PV-Prognose (sichtbarer Fehler)**
`pvActuals.ts` auf `fetchPowerSeriesAuto` als **primäre** Quelle umstellen (Roh nur noch als optionales Detail-Top-up der letzten Minuten, nie als Ersatz). Zusätzlich Schutzregel: Hochskalieren auf die Tagessumme nur, wenn die Stundenverteilung eine plausible Abdeckung hat (mind. mehrere belegte Stunden), sonst Verteilung über Prognosegewichte.

**Schritt 2 — Energiefluss-Monitor**
Die drei Serien-Abfragen auf `fetchPowerSeriesAuto` umstellen, Roh-zuerst-Logik entfernen.

**Schritt 3 — Widgets**
`CustomWidget` (Top-up nur additiv, Aggregat bleibt Basis) und `EnergyGaugeWidget` (Tages-Peak aus `power_max` der 5-Min-Buckets, Live-Wert mit Frischefenster) korrigieren.

**Schritt 4 — Edge Function `pv-forecast`**
Gleiche Umstellung serverseitig, damit `pv_actual_hourly` künftig wieder korrekt befüllt wird; danach Rückfüllung der fehlenden Stunden für die letzten Tage.

**Schritt 5 — Verifikation**
Für jeden Schritt Kontrollabfrage in der Datenbank plus Sichtprüfung im Preview (PV-Widget, Energiefluss, Dashboard-Widgets), damit die Stundenwerte in Summe der Tagessumme entsprechen.

## Technische Notiz

Es wird bewusst **nichts** an der Schreibseite geändert: Die Worker-Aggregation in 5-Minuten-Buckets ist die gewollte IO-Optimierung. Korrekt ist, dass alle Auswertungen den zoom-abhängigen Aggregat-Pfad (`get_power_series_auto`) als Primärquelle verwenden und die Rohtabelle nur noch für „letzter Live-Wert innerhalb weniger Minuten" nutzen.
