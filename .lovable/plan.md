## Ziel

Wir ersetzen die bisherige fehleranfällige Tageswert-Ermittlung durch ein klares Quellenmodell:

1. **Für abgeschlossene Tage** wird der echte Loxone-Tageszähler verwendet.
2. **Für heute** wird der laufende Loxone-Tageszähler verwendet, nicht die 5-Minuten-Schätzung.
3. **5-Minuten-Leistungswerte** bleiben nur für den Tagesverlauf in kW, nicht als Wahrheit für Tages-kWh.
4. Jede Anzeige zeigt eindeutig, ob der Wert aus Loxone, Live-Loxone oder einer Fallback-Schätzung kommt.

## Warum der bisherige Ansatz nicht reicht

Die aktuellen Daten zeigen tatsächlich weiterhin falsche Zuordnungen:

- `15.06.2026` und `16.06.2026` sind in der Datenbank weiterhin identisch.
- `17.06.2026` kommt aktuell als Fallback aus 5-Minuten-Leistungsdaten und liegt deshalb bei ca. `34,739 kWh`, während Loxone laut CSV bereits `1.150,25 kWh` meldet.
- Der Sonntag-Peak ist weiterhin ein starker Hinweis, dass die gespeicherten Tageswerte mindestens teilweise auf den falschen Kalendertag geschrieben wurden.

Wichtig: Ich werde nicht weiter an einzelnen Symptomen löschen oder verschieben, bevor die neue Logik sauber definiert und überprüfbar ist.

## Umsetzungsschritte nach Freigabe

### 1. Live-Writer umbauen: abgeschlossene Tageswerte aus Loxone direkt speichern

In `loxone-api/index.ts` wird der Writer geändert:

- `totalDayLast` bleibt die Quelle für den letzten abgeschlossenen Tag.
- Die Datumszuordnung wird nicht mehr anhand unklarer Server-Zeit-Tricks repariert, sondern strikt nach Loxone-/Berlin-Kalendertag bestimmt.
- Zusätzlich wird der aktuell laufende Tageswert `totalDay` erfasst und als eigener Live-Wert behandelt.

### 2. Heute-Wert im Dashboard korrigieren

Die Datenbankfunktion `get_meter_daily_totals_split_with_fallback` wird angepasst:

- Für historische Tage: bevorzugt archivierte Loxone-Tageswerte.
- Für den heutigen Tag: bevorzugt gespeicherte beziehungsweise live verfügbare Loxone-`totalDay`-Werte.
- Nur wenn Loxone keinen Tageswert liefert: Fallback aus 5-Minuten-Leistungswerten.

Damit soll heute nicht mehr `31,46 kWh` / `34,739 kWh` angezeigt werden, sondern der echte Loxone-Live-Tagesstand im Bereich der CSV-Angabe.

### 3. Neue Prüfansicht / Diagnose-RPC für Tageswerte

Ich erstelle eine kleine Diagnosefunktion, die pro Tag nebeneinander ausgibt:

- gespeicherter Archivwert,
- heutiger Live-Loxone-Wert,
- 5-Minuten-Fallback,
- Quelle,
- Abweichung zur von dir gelieferten CSV-Stichprobe für Juni 2026,
- Verdacht: `ok`, `one_day_offset`, `duplicate`, `fallback_only`, `missing`.

Das ist wichtig, damit wir nicht mehr raten müssen.

### 4. Datenreparatur nur nach Diagnose-Ergebnis

Erst nach der Diagnose werden Daten geändert:

- Keine pauschale Verschiebung aller Tage ohne Beleg.
- Keine Löschung unbekannter Abweichungen.
- Repariert werden nur Datensätze, die anhand der CSV-Stichprobe und/oder Loxone-Live-Werte eindeutig zuordenbar sind.
- Vorher wird eine Backup-Tabelle angelegt.

### 5. Dashboard-Anzeige transparenter machen

Im Diagramm wird unterschieden:

- **Loxone geprüft**: normaler Balken.
- **Heute live aus Loxone**: normaler Balken/Label „laufend“.
- **Fallback aus 5-Minuten-Leistung**: gestreift mit Warnhinweis.
- **Fehlend/unklar**: klar markiert, nicht stillschweigend als echter Tageswert dargestellt.

## Technische Details

Betroffene Stellen:

- `supabase/functions/loxone-api/index.ts`
- Datenbankfunktion `get_meter_daily_totals_split_with_fallback`
- Datenbankfunktion `refresh_meter_daily_totals`
- Tabelle `meter_period_totals`
- Tabelle `meter_daily_totals_mv`
- `src/components/dashboard/EnergyChart.tsx`

Geplante Sicherheitsmaßnahmen:

- Vor jeder Datenänderung Backup der betroffenen Zeilen.
- Datenänderungen nur für `source IN ('loxone', 'loxone_backfill')` und nur für automatische Hauptzähler.
- Keine Änderung an manuellen Zählern.
- Keine Änderung an unbekannten/irrelevanten Loxone-Werten wie CO₂, Temperatur, Witterung, Balkonkraftwerk usw.

## Erwartetes Ergebnis

Nach Umsetzung und Reparaturbericht sollen wir sehen:

- `15.06.2026` ungefähr `1.421,61 kWh`
- `16.06.2026` ungefähr `1.353,51 kWh`
- `17.06.2026` heute laufend ungefähr `1.150,25 kWh` statt ca. `31–35 kWh`
- Sonntage nicht mehr um einen Tag verschoben
- keine stillen Fallback-Werte ohne Kennzeichnung