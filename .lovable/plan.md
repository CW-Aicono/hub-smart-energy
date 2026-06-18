## Befund

Der Job `compact-meter-power-readings-daily` läuft **nur einmal pro Nacht** (Cron `5 0 * * *`) und verdichtet jeweils den **Vortag** aus `meter_power_readings` (roh) in `meter_power_readings_5min`.

- Vor dem WebSocket: Rohtabelle enthielt ~1 Punkt alle 15 Min → Chart sah glatt aus.
- Seit WebSocket-Start um 13 Uhr: Rohtabelle enthält bei „Energiemonitor" **5437 Punkte in 10 h** (≈ alle 7 s) → jede kurze Last-Spitze wird einzeln gezeichnet → Zick-Zack.

Die Daten sind korrekt, nur ungefiltert dargestellt.

## Ziel

Tageschart zeigt auch für „heute" geglättete 5-Min-Mittelwerte, ohne die Rohdaten zu verändern und ohne den nächtlichen Compactor zu gefährden.

## Empfehlung: Frontend-Fallback (günstig, risikoarm)

Im Chart-Datenloader für die Tagesansicht: Wenn Bucket-Daten aus `meter_power_readings_5min` für heute fehlen, **on-the-fly auf 5-Min-Buckets aggregieren** (Mittelwert) und anschließend zeichnen. Der nächtliche Compactor bleibt unverändert; ab dem nächsten Morgen liegen die echten Buckets vor.

### Umsetzungsschritte

1. Hook identifizieren, der den Tageschart füttert (vermutlich `src/hooks/useRealtimePower.ts` oder ein Chart-Loader unter `src/components/dashboard/`).
2. Logik ergänzen:
   - Für Zeitraum **heute** zusätzlich `meter_power_readings` mit `recorded_at >= heute_00:00` laden.
   - Auf 5-Min-Buckets reduzieren (`Math.floor(min/5)*5`), Mittelwert je Bucket bilden.
   - Mit vorhandenen 5-Min-Werten (aus Vortagen) mergen.
3. Keine Schreiboperation. Keine DB-Migration. Keine Edge-Function-Änderung.
4. Kurzer Funktionstest: Tageschart heute neu laden — Zick-Zack ist weg, Verlauf glatt, Werte realistisch.

## Bewusst NICHT geändert

- Compactor-Cron auf häufiger als 1×/Tag stellen → zu riskant, weil seine SQL-Funktion Rohzeilen ganzer Tage löschen kann; mid-day Ausführung könnte aktuelle Sekundenwerte zerstören. Wenn das später gewünscht ist, separates Plan-Thema.
- Realtime-Tabellen-Schema oder WebSocket-Worker.

## Aufwand

Eine kleine Frontend-Änderung in 1 Hook + ggf. 1 Hilfsfunktion. Keine Migration, kein Edge-Function-Deploy.
