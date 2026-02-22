
# Spotpreis-Optimierung: 15-Minuten-Aufloesung korrekt darstellen

## Ausgangslage

Die energy-charts.info API liefert seit der EPEX-Umstellung (01.10.2025) bereits **96 Viertelstunden-Werte pro Tag**. Euer System speichert diese korrekt in der Datenbank. Der Chart zeigt sie prinzipiell an, aber einige Details im Widget und der Edge Function koennten optimiert werden, um die hoehere Aufloesung besser zu nutzen und die Preise fuer morgen zuverlaessig darzustellen.

## Aenderungen

### 1. Edge Function: Robustere Datenbeschaffung
**Datei:** `supabase/functions/fetch-spot-prices/index.ts`

- Aktuell wird `end` auf `+2 Tage` gesetzt -- das ist korrekt und liefert die Preise fuer morgen, sobald die Auktion gelaufen ist (ca. 13:00 MEZ)
- Keine Aenderung noetig an der API-Logik -- die Daten kommen bereits in 15-Min-Aufloesung

### 2. SpotPriceWidget: Chart-Darstellung anpassen
**Datei:** `src/components/dashboard/SpotPriceWidget.tsx`

- **Widget-Titel** von "Spotpreis-Verlauf (48h)" auf "Spotpreis-Verlauf (Day-Ahead, 15 min)" aendern, um die Aufloesung klar zu kommunizieren
- **X-Achsen-Ticks**: Beibehalten der 3-Stunden-Ticks, da bei 96+ Datenpunkten pro Tag engere Ticks unleserlich waeren
- **Tooltip**: Um Viertelstunden-Zeitstempel korrekt anzuzeigen (z.B. "14:15" statt nur volle Stunden) -- das funktioniert bereits, da `format(d, "HH:mm")` genutzt wird

### 3. Hook: Zeitfenster pruefen
**Datei:** `src/hooks/useSpotPrices.tsx`

- Der Hook filtert aktuell `-3h` bis `+48h`. Bei 15-Min-Aufloesung ergeben sich bis zu ~200 Datenpunkte statt ~50 -- das ist unproblematisch
- `currentPrice`-Logik funktioniert korrekt: Sie findet den letzten Eintrag vor "jetzt", was bei 15-Min-Intervallen den aktuellen Viertelstunden-Preis liefert

## Zusammenfassung

Die gute Nachricht: Das System funktioniert bereits grundsaetzlich mit 15-Minuten-Daten. Die einzige sichtbare Aenderung ist die Anpassung des Widget-Titels, um die hoehere Aufloesung transparent zu machen. Die Preise fuer morgen sind ab ca. 13:00 Uhr verfuegbar und werden beim naechsten Cron-Lauf abgeholt und angezeigt.
