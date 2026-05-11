## Problem

Der aktuelle CSV-Export auf `/energy-data` enthält nur **Zähler-Stammdaten** (Name, Nummer, Einheit, Erfassungsart) und **manuelle Ablesungen** aus `meter_readings`. Für automatisch erfasste Zähler (Loxone, Shelly, Schneider, Siemens, EMS-Gateway) liegen die Daten aber in **anderen Tabellen** und werden weder exportiert noch importiert. Im hochgeladenen Beispiel-Export sieht man genau das: nur Stammdaten, keine Werte.

## Ziel

Export und Import sollen die tatsächlichen Verbrauchs- und Leistungsdaten enthalten — vollständig, wiederherstellbar (Round-Trip), und für Laien verständlich (Excel-kompatibel, deutsches Zahlenformat, Semikolon).

## Datenquellen (Ist-Zustand)


| Tabelle                     | Inhalt                                                                 | Heute exportiert? |
| --------------------------- | ---------------------------------------------------------------------- | ----------------- |
| `meters`                    | Stammdaten                                                             | Ja                |
| `meter_readings`            | Manuelle Zählerstände                                                  | Ja                |
| `meter_period_totals`       | Tages-/Monatsverbrauch (kWh, m³) — Hauptquelle für automatische Zähler | **Nein**          |
| `meter_power_readings_5min` | 5-Min-Leistungswerte (kW) — für Lastprofile/Charts                     | **Nein**          |


## Plan

### 1. Export — drei zusätzliche Datenbereiche

In `src/pages/EnergyData.tsx` werden drei neue Checkboxen ergänzt:

- ☐ **Tages-/Monatsverbräuche** (`meter_period_totals`) — Standard: an
- ☐ **5-Minuten-Leistungswerte** (`meter_power_readings_5min`) — Standard: aus, mit Hinweis "kann sehr groß werden"
- ☐ **Manuelle Ablesungen** (`meter_readings`) — wie heute, Standard: an

Pro Bereich werden eigene Zeilen mit `Quelle = "Verbrauch (Tag)"`, `"Verbrauch (Monat)"`, `"Leistung 5min"` oder `"Ablesung"` geschrieben. Spalten:

```
Quelle;Standort;Zähler;Zählernummer;Energieart;Datum;Zeit;Wert;Einheit;Erfassung;Quellsystem
```

Datum/Zeit getrennt für Excel-Filter, Werte im deutschen Format (Komma) via `toLocaleString("de-DE")`.

**Performance:** 5-Min-Werte werden in 50.000er-Batches paginiert, mit Fortschrittstoast. Bei > 200.000 Zeilen wird statt CSV automatisch ein **ZIP mit mehreren CSVs** (eine pro Datenbereich) geliefert, damit Excel nicht abstürzt.

### 2. Import — drei neue Importtypen

In `src/components/energy-data/DataImportDialog.tsx` und `useDataImport.tsx` wird `ImportType` erweitert:

```ts
type ImportType = "readings" | "consumption" | "consumption_monthly" | "power_5min";
```

- `**consumption**` (Tag) → `meter_period_totals` mit `period_type = 'day'` (existiert bereits, nur Mapping erweitern)
- `**consumption_monthly**` (Monat) → `meter_period_totals` mit `period_type = 'month'`
- `**power_5min**` → `meter_power_readings_5min` mit Bucket-Validierung (Vielfaches von 5 Min, UTC)

Alle Importe erkennen den **Quelle-Spaltenwert aus dem Export automatisch** — d. h. ein unverändert re-importiertes Export-CSV verteilt seine Zeilen selbst auf die richtigen Tabellen (Round-Trip).

**Konflikt-Strategie** (per Radio-Button im Dialog):

- *Überspringen* (Default): vorhandene Werte bleiben
- *Überschreiben*: `ON CONFLICT … DO UPDATE`
- *Nur neue Zeitpunkte*: Insert mit `ON CONFLICT DO NOTHING`

### 3. CSV-Template-Generator

Drei neue Vorlagen-Buttons im Import-Dialog:

- "Vorlage Tagesverbrauch"
- "Vorlage Monatsverbrauch"  
- "Vorlage 5-Min-Leistung"

Jede mit 2 Beispielzeilen + erklärendem Header-Kommentar (`# Spalten: …`).

### 4. Validierung

- Zähler-Lookup wie heute (Zählernummer, sonst Name+Standort als Fallback)
- Einheit muss zur `meters.unit` passen, sonst Warnung mit automatischer Umrechnung (z. B. m³ Gas → kWh über Brennwert, falls hinterlegt)
- Negative Werte erlaubt (Einspeisung) — keine Warnung mehr
- Duplikat-Erkennung pro `(meter_id, period_start)` bzw. `(meter_id, bucket)`

### 5. Technische Umsetzung


| Datei                                             | Änderung                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/pages/EnergyData.tsx`                        | 3 neue Checkboxen, erweiterte `buildExportRows`, ZIP-Fallback via `jszip` |
| `src/lib/exportUtils.ts`                          | Neue Helper `downloadCsvZip(files[])`, deutsches Zahlenformat             |
| `src/lib/csvParser.ts`                            | Neue Felder `period_type`, `bucket_time` im `MappableField`-Typ           |
| `src/hooks/useDataImport.tsx`                     | 2 neue Import-Pfade, `conflictStrategy`-Param                             |
| `src/components/energy-data/DataImportDialog.tsx` | Importtyp-Auswahl auf 4 Optionen erweitert, Konflikt-Strategie            |


Keine DB-Migration nötig — alle Tabellen existieren bereits inkl. RLS.

## Bonus (optional, separat)

- **Auto-Erkennung beim Import**: Wenn die hochgeladene CSV eine `Quelle`-Spalte hat (Lovable-Export-Format), Schritt "Importtyp wählen" überspringen und direkt verteilen.
- **XLSX-Export** mit mehreren Tabs (Stammdaten / Tagesverbrauch / Leistung) — über `@e965/xlsx`, das schon im Projekt ist.

Soll ich den Plan direkt umsetzen, oder zuerst nur Teil 1 + 2 (Export + Import von Tages-/Monatsverbrauch), und 5-Min-Leistung in einem zweiten Schritt?  
  
Antwort: Gerne den Plan komplett umsetzen.ond auch gleich mit dem optionalen Bonus bitte.