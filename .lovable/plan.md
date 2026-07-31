# Kalender-Zeiträume im Detaildialog + Live-Badge-Alter

## 1. Energie im Detaildialog ≠ „Gesamt heute" der Kachel

Verifiziert in der Datenbank für „Zähler Gesamtverbrauch":

- Kachel liest `meter_period_totals` (Tag 31.07.) → **1.390,151 kWh** — das ist der Wert in Screenshot 2.
- Der Detaildialog ruft `get_meter_period_sums_with_fallback` auf. Diese Funktion liest ausschließlich `meter_daily_totals_mv` und begrenzt den Zeitraum auf `LEAST(p_to_date, CURRENT_DATE - 1)` — **der laufende Tag ist ausgeschlossen**. Für den 24-h-Bereich liefert sie deshalb gar keine Zeile.
- Ohne Zeile fällt der Dialog auf die Trapez-Integration der Leistungsreihe zurück → **742,05 kWh** (Screenshot 1).

Dazu kommt dein Punkt: der Dialog zeigt ein **rollendes** 24-h-Fenster, die Kachel den Kalendertag. Selbst mit korrekter Quelle könnten die Werte nie übereinstimmen.

### Umsetzung: Kalender-Zeiträume statt rollender Fenster
- Umschalter im Dialog wird zu **Tag / Woche / Monat** (der 1-h-Bereich bleibt als Live-Ansicht erhalten).
  - Tag: 00:00–24:00 Uhr (Europe/Berlin)
  - Woche: aktuelle Kalenderwoche, Wochenstart aus den Tenant-Einstellungen (`week_start_day`, vorhandener Hook `useWeekStartDay`)
  - Monat: aktueller Kalendermonat
- **Vor-/Zurückblättern** je Zeitraum mit Pfeilen und Beschriftung des gewählten Zeitraums („31.07.2026", „KW 31", „Juli 2026"); der Vorwärts-Pfeil ist im laufenden Zeitraum deaktiviert.
- Leistungsgraph, Energie-Balken und Ø/Max/Min beziehen sich auf denselben Kalender-Zeitraum (Serie weiterhin über `get_power_series_auto`).
- Die KPI „Energie" kommt aus `meter_period_totals` — dieselbe Quelle wie die Kachel: Tageszeile(n) des gewählten Zeitraums, summiert. Neuer schlanker Hook `useMeterPeriodTotals`, damit Kachel und Dialog nicht erneut auseinanderlaufen.
- Die Trapez-Integration bleibt nur Fallback für den 1-h-Live-Bereich und für Zähler ohne Tageszeile.
- `get_meter_period_sums_with_fallback` wird zusätzlich um den laufenden Tag ergänzt (Tageszeile aus `meter_period_totals` für `CURRENT_DATE`), damit alle weiteren Aufrufer dieser Funktion nicht denselben Fehler zeigen.

## 2. Graue Badges statt grünem „Live"

Das Badge auf der Live-Werte-Seite wird nur grün, wenn ein Zeitstempel aus dem Loxone-Broadcast vorliegt und jünger als 60 s ist. Zähler ohne WS-Broadcast haben gar keinen Zeitstempel und zeigen „–" (grauer Punkt), obwohl aus der Datenbank ein Wert vorliegt.

### Umsetzung
- Der beim DB-Abgleich gewählte Messzeitpunkt wird mitgeführt und als Alters-Fallback verwendet: statt „–" steht dort „vor 3 Min"; grün nur bei echter Frische unter 60 s.
- Kein Wert und kein Zeitstempel → weiterhin „–" mit neutralem Tooltip „Kein aktueller Messwert". **Keine Verlinkung in den Super-Admin** — Tenant und Super-Admin bleiben strikt getrennt.

## Technische Details

Geändert: `src/components/dashboard/EnergyFlowMonitor.tsx` (Zeitraum-Umschalter, Blättern, Energie-KPI), neuer Hook `src/hooks/useMeterPeriodTotals.ts`, `src/pages/LiveValues.tsx` (Zeitstempel im `liveValues`-State, Badge-Fallback), eine Migration für `get_meter_period_sums_with_fallback` (laufender Tag).

## Verifikation

- „Zähler Gesamtverbrauch", Tag 31.07.: Detaildialog zeigt denselben Wert wie „Gesamt heute" der Kachel.
- Zurückblättern auf den 30.07. zeigt die Tagessumme dieses Tages; Woche/Monat entsprechen der Summe der enthaltenen Tageszeilen.
- Live-Seite: kein Zähler mit Wert zeigt mehr „–"; grüne Badges nur bei Broadcast unter 60 s; keine Super-Admin-Links im Tenant.
