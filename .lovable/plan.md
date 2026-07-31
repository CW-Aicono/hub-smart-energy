# Zwei Abweichungen: Energie-KPI und graue Live-Badges

## 1. Energie im Detaildialog ≠ „Gesamt heute" der Kachel

Verifiziert in der Datenbank für „Zähler Gesamtverbrauch":

- Kachel liest `meter_period_totals` (Tag 31.07.) → **1.390,151 kWh** — das ist der Wert in Screenshot 2.
- Der Detaildialog ruft `get_meter_period_sums_with_fallback` auf. Diese Funktion liest ausschließlich `meter_daily_totals_mv` und begrenzt den Zeitraum auf `LEAST(p_to_date, CURRENT_DATE - 1)` — **der heutige Tag ist ausgeschlossen**. Für den 24-h-Bereich liefert sie deshalb gar keine Zeile.
- Ohne Zeile fällt der Dialog auf die Trapez-Integration der Leistungsreihe zurück → **742,05 kWh** (Screenshot 1).

Die Umstellung auf „dieselbe Quelle wie die Kachel" ist also nur scheinbar erfolgt: die gewählte Funktion kennt den laufenden Tag nicht.

### Umsetzung
- Der Detaildialog holt die Energiemenge direkt aus `meter_period_totals` — genau wie die Kachel: 24 h → Tageszeile von heute; 7 d / 30 d → Summe der Tageszeilen im Zeitraum.
- Neuer schlanker Hook (`useMeterPeriodTotals`) für diese Abfrage, damit Kachel und Dialog denselben Pfad nutzen und nicht erneut auseinanderlaufen.
- Die Trapez-Integration bleibt nur noch Fallback für den 1-h-Bereich und für Zähler ohne Tageszeile; sie wird im Dialog als solcher gekennzeichnet.
- `get_meter_period_sums_with_fallback` wird zusätzlich um den laufenden Tag ergänzt (Tageszeile aus `meter_period_totals` für `CURRENT_DATE`), damit alle weiteren Aufrufer dieser Funktion nicht denselben Fehler zeigen.

Randbefund, nicht Teil dieses Fixes, aber auffällig: die Tagessummen dieses Zählers sind vom 25.–30.07. mit 2.035,343 kWh nahezu identisch. Das prüfe ich nach dem Fix gesondert.

## 2. Graue Badges statt grünem „Live"

Das Badge auf der Live-Werte-Seite wird nur grün, wenn ein Zeitstempel aus dem Loxone-Broadcast vorliegt und jünger als 60 s ist. Zähler, die keinen WS-Broadcast bekommen — genau die Blöcke ohne eindeutige Leistungs-State-Zuordnung — haben gar keinen Zeitstempel und zeigen deshalb „–" (grauer Punkt), obwohl aus der Datenbank ein Wert vorliegt.

### Umsetzung
- Der beim DB-Abgleich gewählte Messzeitpunkt wird mitgeführt und als Alters-Fallback verwendet. Ergebnis: statt „–" steht dort „vor 3 Min", grün nur bei echter Frische unter 60 s.
- Kein Wert und kein Zeitstempel → weiterhin „–", aber mit Tooltip „Keine Leistungs-State-Zuordnung", verlinkt auf die State-Zuordnung im Super-Admin.

## Technische Details

Geändert: `src/components/dashboard/EnergyFlowMonitor.tsx` (Energie-KPI), neuer Hook `src/hooks/useMeterPeriodTotals.ts`, `src/pages/LiveValues.tsx` (Zeitstempel im `liveValues`-State, Badge-Fallback), eine Migration für `get_meter_period_sums_with_fallback` (laufender Tag).

## Verifikation

- „Zähler Gesamtverbrauch", 24 h: Detaildialog zeigt 1.390,15 kWh — identisch zur Kachel.
- 7 d / 30 d: Dialogsumme entspricht der Summe der Tageszeilen.
- Live-Seite: kein Zähler mit Wert zeigt mehr „–"; grüne Badges nur bei Broadcast unter 60 s.
