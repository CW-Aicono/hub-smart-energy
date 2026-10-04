# Dashboard: eigener Zeitraum pro Grafik + Ausbau Energieanalyse

## Wo das Analytics Studio ist
Linke Seitenleiste → **Energiedaten → Analytics Studio** (Adresse `/analytics-studio`). Dort gibt es schon Arbeitsbereiche mit Bausteinen (Zeitreihe, Vergleich, Heatmap, Kennzahlen, Formel, Korrelation, KI-Hinweise). Dieses Studio bauen wir zur großen Energieanalyse aus.

## Teil 1 – Dashboard (Schnellübersicht)
- Jede Grafik hat ihren **eigenen Zeitraum** (Tag/Woche/Monat/Quartal/Jahr) und ihr eigenes Blättern vor/zurück.
- Ändert man den Zeitraum in einer Grafik, bleiben alle anderen gleich.
- Die Auswahl wird **dauerhaft pro Grafik gespeichert** und ist nach dem Neuladen noch da.
- Die Auswahl der Liegenschaft oben bleibt gemeinsam für alle Grafiken.
- Neu in jeder Grafik: Knopf **„In Analyse öffnen“**. Er öffnet dieselben Daten im Studio.

## Teil 2 – Energieanalyse (orientiert an dezem)
1. **Mehrere Zähler vergleichen:** Beliebige Zähler und Sensoren landen in einer Grafik. Jede Einheit (kWh, kW, m³, °C) bekommt eine eigene Achse. Darstellung als Linie, Balken oder gestapelt, Farbe frei wählbar, Werte als Summe oder Mittelwert.
2. **Zeitraumvergleich:** Ein Zeitraum lässt sich gegen den vorherigen oder einen frei gewählten legen, z. B. diese Woche gegen letzte Woche oder ein Jahr gegen das Vorjahr. Die Grafiken liegen übereinander, dazu kommt die Abweichung in % und kWh.
3. **Heatmap & Dauerlinie:** Ein Teppichdiagramm zeigt Stunde × Tag. Eine Lastdauerlinie zeigt die Werte sortiert, mit Markierung von Grundlast und Spitzenlast.
4. **Export & Kennzahlen:** Zu jeder Reihe gibt es Min, Max, Summe, Mittel und Grundlast. Werte lassen sich auf m² beziehen oder nach Wetter (Heizgradtage über Open-Meteo) bereinigen. Export als CSV und Excel.
5. **Freie Zeitwahl:** Schnellwahl (heute, 7 Tage, Monat, Jahr) oder ein Kalenderbereich. Die Auflösung (5 Min, Stunde, Tag, Woche, Monat) passt sich automatisch an und lässt sich auch selbst wählen.

## Teil 3 – Teilen per Link
- Alle Einstellungen der Grafik stecken direkt in der Adresse: Zähler, Zeitraum, Vergleich, Diagrammart, Auflösung, Kennzahlen.
- Der Knopf **„Link kopieren“** kopiert diese Adresse. Kollegen öffnen sie und sehen sofort dieselbe Analyse.
- **Sicherheit:** Der Link enthält keine Daten, nur Einstellungen. Wer ihn öffnet, muss angemeldet sein und sieht nur Zähler, für die er berechtigt ist. Fehlende Zähler werden mit einem Hinweis ausgeblendet. Die Mandantentrennung bleibt unverändert.
- Gespeicherte Arbeitsbereiche im Studio bleiben wie bisher erhalten.

## Umsetzungsreihenfolge
1. Dashboard: Zeitraum pro Grafik (kleiner Schritt, sofort nutzbar)
2. Studio: Analyse-Ansicht mit Zählervergleich, freier Zeitwahl und Link-Teilen
3. Zeitraumvergleich
4. Heatmap und Dauerlinie
5. Kennzahlen, Flächen- und Wetterbezug, Export
Nach jedem Schritt: Auswirkungen prüfen, Build prüfen, Änderungsprotokoll und Versionshinweise ergänzen.

## Technische Details
- `useDashboardFilter`: Liegenschaft bleibt global. Den Zeitraum übernimmt ein neuer Hook `useWidgetPeriod(widgetId)` mit lokalem Zustand, der in `dashboard_widgets.config.period/offset` gespeichert wird; bestehende Spalte `config`, keine Migration. Er wird in EnergyChart, CustomWidget, PvForecastWidget, SankeyWidget, PieChartWidget, SustainabilityKPIs, CostOverview, EnergyFlowMonitor und PeriodPickerLabel eingesetzt. Fallback ist „day“; der Demo-Modus speichert in localStorage.
- Analysezustand wird als kompaktes, versioniertes Objekt (`v=1`) base64url-codiert im Suchparameter `?a=` abgelegt und beim Laden mit Zod geprüft. Unbekannte Felder werden ignoriert.
- Datenabfrage nur über bestehende RPCs (`get_power_series_auto`, `get_meter_daily_totals_*`) mit RLS und `tenant_id`-Filter. Für die Dauerlinie und die Heatmap werden die vorhandenen Stunden- bzw. 5-Min-Daten verwendet; keine Vollscans, mit Blick auf das IO-Budget.
- Excel-Export über das vorhandene `@e965/xlsx`. Alle Zahlen im Format `de-DE`.
- Neue Texte in DE, EN, ES und NL.
