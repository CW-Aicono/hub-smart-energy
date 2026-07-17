## Analyse-Ergebnis

Die Ursache ist jetzt klarer: Die Codebasis kann identisch sein, aber die **Datenhaltung in Lovable** ist anders sichtbar als erwartet.

Für den betroffenen Speicher/Zähler zeigen die Backend-Daten aktuell:

- `meter_power_readings` Rohdaten: **erst ab 17.07. 02:00 CEST** vorhanden
- `meter_power_readings_5min` verdichtete Historie: **ab 16.07. ca. 08:10 CEST** vorhanden
- `storage_soc_readings`: **volle 24h SOC-Historie** vorhanden

Der Detail-Dialog liest die Leistung aber aktuell nur aus `meter_power_readings`. Deshalb beginnt die Leistungsfläche in Lovable erst ab 02:00 Uhr. Auf Hetzner ist die Anzeige vermutlich korrekt, weil dort entweder die Rohdaten länger behalten werden oder die dortige Version bereits die verdichtete 5-Minuten-Tabelle nutzt.

## Plan

1. **Power-Query im Detail-Dialog erweitern**
   - Für `24h`, `7d` und `30d` zusätzlich `meter_power_readings_5min` laden.
   - Für `1h` weiterhin primär Rohdaten nutzen.
   - Rohdaten und 5-Minuten-Daten nach Timestamp zusammenführen; neuere Rohwerte überschreiben verdichtete Werte im gleichen Zeitbucket.

2. **Getrennte Startzeiten einführen**
   - `powerStartMs = now - range`
   - `socStartMs = max(now - range, storage.created_at)` nur für SOC
   - Damit wird die Leistung nicht versehentlich durch das Speicher-Erstellungsdatum gekappt.

3. **Speicher-Zuordnung im Dialog angleichen**
   - Dieselbe Fallback-Logik wie beim KPI verwenden: `power_meter_id` → `gateway_device_id` → `location_id`.
   - Dadurch kann der SOC-KPI nicht korrekt sein, während der Dialog eine andere/falsche Storage-Historie nutzt.

4. **Chart-Daten sauber mergen**
   - Power und SOC weiterhin auf gemeinsame Zeit-Buckets legen.
   - SOC-Linie bleibt `connectNulls`, damit 15-Minuten-SOC mit 5-Minuten-Power sauber parallel sichtbar ist.

5. **Energie-Balken und KPIs auf die neue Leistungsserie umstellen**
   - Durchschnitt/Max/Min und Energie-Bezug/Einspeisung verwenden dieselbe kombinierte Leistungsserie.
   - Bezug bleibt positiv, Einspeisung negativ im Balkendiagramm.

6. **Verifikation**
   - Backend-Daten erneut prüfen: kombinierte Leistungsserie muss vor 02:00 starten.
   - Preview prüfen: 24h-Detailansicht zeigt Leistung und SOC über denselben Zeitraum; 7 Tage nutzt ebenfalls 5-Minuten-Historie.