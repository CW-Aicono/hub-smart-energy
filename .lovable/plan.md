# Kachel vs. Detailansicht: eine Quelle statt eigener Rechenlogik

## Befund (in der Datenbank verifiziert)

Beispiel „Zähler Kühlschrank" (Einheit kW, Typ Strom):

| Anzeige | Wert | Quelle |
|---|---|---|
| Kachel „Gesamt heute" | 445 Wh | `meter_period_totals` (period_type=day) — heute **0,465 kWh**, Vortage 0,436–0,613 kWh, `source = loxone/loxone_live` |
| Kachel Zählerstand | 100,6 kWh | Rollenwert `total` aus dem Loxone-Zählerbaustein |
| Detail „Energie 24 h" | 192,90 kWh | **selbst gerechnet**: Trapez-Integration über die Leistungsreihe |
| Detail Ø/Max | 12,33 / 99,76 kW | Min/Max/Ø über dieselbe Leistungsreihe |

Der Detaildialog rechnet also alles selbst, statt die bereits vorhandenen, geprüften Tagessummen zu verwenden. Damit hast du recht: die Energie kann direkt aus der Quelle kommen, die die Kachel schon nutzt.

Aber: der Leistungsverlauf und Ø/Max/Min stammen bereits aus den 5-Minuten-Buckets (`meter_power_readings_5min`) — dieselbe Tabelle, die auch das Dashboard nutzt. Diese Tabelle ist an einzelnen Stellen verunreinigt:

```text
19:05  power_avg 0,0494   power_max 0,0599    (echte Leistung)
13:35  power_avg 99,76    power_max 100,49    (= der Zählerstand 100,6 kWh)
```

Alle Ausreißer haben `source = 'bridge_ws'` und liegen exakt auf dem Zählerstand. Der Loxone-WS-Worker stuft in `classifyAux` (`docs/loxone-ws-worker/index.ts`, Zeile 1122 ff.) einen kumulativen Zählerstand nach einem einzigen Rückgang (Reset/Nullwert) dauerhaft als Momentanleistung ein; der Spike-Filter greift nicht, weil 100 kW für Strom (Limit 10.000) plausibel wirkt.

Betroffene Zähler der letzten 48 h (|power_avg| > 20, `bridge_ws`):

```text
ESB Leistung Sinec Energiespeicher 188 | Voltage L1-L2 52 | ESB Leistung Messschrank Wago 45
Erzeugung 22 | PAC 3220 NSHV Süd 20 | Zähler Gesamtverbrauch 16 | Zähler Kühlschrank 16
Eigenverbrauch 15 | Ostflügel OG Süd 12 | PAC 3220 NSHV Nord 11 | Einspeisung 6
```

Ein Umbau der Anzeige allein reicht deshalb nicht: die Energie wird durch die Umstellung sofort richtig, Ø/Max/Min und der Graph bleiben aber falsch, solange die Fehlzeilen in der Tabelle stehen.

## Umsetzung

### 1. Energie aus der vorhandenen, korrekten Quelle
Im Detaildialog (`MeterDetailDialog` in `EnergyFlowMonitor.tsx`) wird die KPI „Energie" nicht mehr integriert, sondern über `get_meter_totals_auto` bzw. `get_meter_daily_totals_split_with_fallback` geladen — exakt die Quelle hinter „Gesamt heute" der Kachel. 24 h = heutiger Tageswert, 7 d/30 d = Summe der Tageswerte. Nur im 1-Stunden-Fenster bleibt die Integration, weil es dafür keinen gespeicherten Wert gibt; dort wird sie als „aus Leistungsverlauf berechnet" gekennzeichnet.

### 2. Leistungsverlauf über den gemeinsamen Standardpfad
Die handgeschriebene Abfragekette im Dialog (5-Min-Tabelle + Roh-Top-up + Sensor-Fallback) wird durch `fetchPowerSeriesAuto` (`src/lib/powerSeries.ts`, RPC `get_power_series_auto`) ersetzt — derselbe Pfad, den Dashboard und Analytics Studio nutzen, inkl. zoomabhängiger Auflösung (5 Min / 15 Min / 1 h / 1 Tag). Ø/Max/Min werden aus dieser Reihe gebildet (Max aus `power_max`). Kein zweiter Datenpfad mehr.

### 3. Fehlzeilen entfernen (Voraussetzung dafür, dass 2 stimmt)
Migration, die die verunreinigten Buckets löscht: `source = 'bridge_ws'` und `power_avg` innerhalb ±2 % des Zählerstands des jeweiligen Zählers bzw. > 50× des Medians der übrigen Buckets desselben Zählers. Trefferliste je Zähler wird vor dem Löschen ausgegeben; echte Lastspitzen bleiben erhalten.

### 4. Worker härten, damit es nicht zurückkommt (v1.15)
- `classifyAux`: `pwr` erst bei mehreren echten Rückgängen; ein Reset auf 0 oder ein Sprung auf einen kleineren Startwert zählt nicht mehr als Rückgang.
- Liegt ein Kandidatenwert nahe am bekannten `total`/`today` desselben Bausteins, wird er nie zu `pwr`.
- Einmal als `total` erkannte States werden nicht mehr umklassifiziert; States mit Einheit V/A/Hz/°C schreiben nie in die Leistungsreihe.
- Update-Anleitung `docs/loxone-ws-worker/UPDATE-v1.15-role-hardening.md`.

## Verifikation

- „Zähler Kühlschrank", 24 h: Energie zeigt denselben Wert wie die Kachel (heute 0,465 kWh); Ø/Max liegen bei 0,05–0,07 kW.
- Vergleich Detailgraph ↔ Dashboard-Energieverbrauch für denselben Zähler und Zeitraum: identischer Verlauf.
- „Voltage L1-L2" und „Ostflügel OG Süd": keine Zählerstands-/Spannungswerte mehr in der Leistungsreihe.

## Technische Details

Geänderte Dateien: `src/components/dashboard/EnergyFlowMonitor.tsx` (Energie-KPI und Serienabfrage), eine SQL-Bereinigungsmigration, `docs/loxone-ws-worker/index.ts` + Update-Doku. Der Worker auf Hetzner muss nach dem Merge neu gebaut/gestartet werden.
