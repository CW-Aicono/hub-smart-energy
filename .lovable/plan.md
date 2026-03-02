# Altdaten-Import per CSV/Excel -- Implementierungsplan

## Ziel

Kommunale Energiemanager sollen historische Verbrauchsdaten (z.B. aus alten Excel-Listen oder Abrechnungen) komfortabel in das System importieren koennen. Dies ist essentiell fuer den Energiebericht, da Benchmarking und Trendanalysen mindestens 3 Jahre Datenhistorie benoetigen.

---

## Zwei Import-Typen

### 1. Zaehlerstaende importieren (meter_readings)

Fuer historische Zaehlerstaende, z.B. aus Jahresabrechnungen oder manuellen Listen.

**Erwartete CSV-Spalten:**


| Spalte        | Pflicht | Beschreibung                                                |
| ------------- | ------- | ----------------------------------------------------------- |
| Zaehlernummer | Ja      | Zuordnung zum bestehenden Zaehler via `meters.meter_number` |
| Datum         | Ja      | Ablesedatum (DD.MM.YYYY oder YYYY-MM-DD)                    |
| Wert          | Ja      | Zaehlerstand als Zahl                                       |
| Notiz         | Nein    | Optionaler Kommentar                                        |


### 2. Verbrauchsdaten importieren (meter_period_totals)

Fuer aggregierte Verbrauchswerte (z.B. Monatsverbraeuche aus Energieabrechnungen).

**Erwartete CSV-Spalten:**


| Spalte        | Pflicht | Beschreibung                                |
| ------------- | ------- | ------------------------------------------- |
| Zaehlernummer | Ja      | Zuordnung zum bestehenden Zaehler           |
| Zeitraum      | Ja      | Monat oder Tag (MM/YYYY oder DD.MM.YYYY)    |
| Verbrauch     | Ja      | Verbrauchswert in kWh (oder Zaehlereinheit) |
| Energieart    | Nein    | Ueberschreibt den Energietyp des Zaehlers   |


---

## Import-Workflow (UI)

```text
+------------------------------------------+
| 1. Datei hochladen                       |
|    [CSV waehlen] oder [Excel waehlen]    |
|    Drag & Drop Zone                      |
+------------------------------------------+
           |
           v
+------------------------------------------+
| 2. Spaltenzuordnung (Mapping)            |
|    Vorschau der ersten 5 Zeilen          |
|    Dropdown pro erkannte Spalte:         |
|    "Spalte A" --> [Zaehlernummer v]      |
|    "Spalte B" --> [Datum v]              |
|    "Spalte C" --> [Wert v]               |
|    Auto-Erkennung gaengiger Header       |
+------------------------------------------+
           |
           v
+------------------------------------------+
| 3. Validierung & Vorschau                |
|    - Zaehlernummern pruefen (gefunden?)  |
|    - Datumsformate validieren            |
|    - Plausibilitaetspruefung (Werte)     |
|    - Duplikat-Erkennung                  |
|                                          |
|    Zusammenfassung:                      |
|    [x] 142 gueltige Zeilen              |
|    [!] 3 unbekannte Zaehlernummern      |
|    [!] 2 moegliche Duplikate            |
|    [x] 0 ungueltige Datumswerte         |
+------------------------------------------+
           |
           v
+------------------------------------------+
| 4. Import ausfuehren                     |
|    Fortschrittsbalken                    |
|    Ergebnis: "139 Eintraege importiert"  |
+------------------------------------------+
```

---

## Technische Umsetzung

### Neue Dateien


| Datei                                             | Zweck                                                           |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `src/components/energy-data/DataImportDialog.tsx` | Haupt-Dialog mit Stepper (Upload, Mapping, Validierung, Import) |
| `src/lib/csvParser.ts`                            | CSV/Excel-Parsing, Spaltenerkennung, Datumskonvertierung        |
| `src/hooks/useDataImport.tsx`                     | Import-Logik: Validierung, Batch-Insert, Fortschritt            |


### CSV/Excel Parsing (`csvParser.ts`)

- **CSV**: Nativer Browser-Parser (kein externes Paket noetig). Unterstuetzt `;` und `,` als Trennzeichen. BOM-Erkennung fuer deutsche Excel-Exporte.
- **Excel (.xlsx)**: Verwendung von SheetJS (`xlsx` npm-Paket, ~200kB). Liest erstes Tabellenblatt, konvertiert zu Array-of-Objects.
- **Datumsformate**: Erkennung von DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY, MM/YYYY.
- **Zahlenformate**: Deutsche Notation (Komma als Dezimaltrennzeichen, Punkt als Tausender) wird automatisch konvertiert.

### Auto-Erkennung der Spalten

Haeufige Header-Varianten werden automatisch gemappt:

```text
Zaehlernummer: "Zählernummer", "Zaehlernr", "meter_number", "Zähler-Nr"
Datum:         "Datum", "Ablesedatum", "date", "reading_date", "Zeitraum"
Wert:          "Wert", "Zählerstand", "Stand", "value", "Verbrauch"
Notiz:         "Notiz", "Bemerkung", "notes", "Kommentar"
```

### Validierungsregeln

1. **Zaehlernummer-Abgleich**: Jede Zaehlernummer wird gegen `meters.meter_number` im Mandanten geprueft. Nicht gefundene Nummern werden als Warnung angezeigt (Import trotzdem moeglich, wenn Nutzer die Zeilen ausschliesst).
2. **Datumsvalidierung**: Datum muss parsebar sein und darf nicht in der Zukunft liegen.
3. **Wert-Plausibilitaet**: Negativwerte werden als Warnung markiert. Bei Zaehlerstaenden: Pruefen, ob der neue Wert kleiner als ein bereits vorhandener Wert fuer dasselbe Datum ist.
4. **Duplikaterkennung**: Gleiche Kombination aus Zaehler + Datum wird als potenzielles Duplikat markiert (Nutzer entscheidet: ueberspringen oder ueberschreiben).

### Batch-Insert (`useDataImport.tsx`)

- Daten werden in Batches von 100 Zeilen eingefuegt (Supabase-Limit beachten).
- `capture_method` wird auf `"csv_import"` gesetzt fuer Traceability.
- Fortschrittsanzeige ueber State (0-100%).
- Bei Fehler in einem Batch: Warnung anzeigen, restliche Batches fortsetzen.
- Nach erfolgreichem Import: Query-Cache invalidieren (`meter_readings`, `meter_period_totals`).

### Integration in die UI

- **Neuer Button auf der Energiedaten-Seite** (`EnergyData.tsx`): "Daten importieren" (Upload-Icon) neben den Export-Buttons.
- **Dialog oeffnet den Stepper** mit den 4 Schritten.
- **Download einer Vorlage**: Button im Dialog zum Herunterladen einer CSV-Vorlage mit den erwarteten Spalten und einer Beispielzeile.

### Uebersetzungen

Neue Keys in `translations.ts` fuer alle vier Sprachen (DE, EN, ES, NL):

- `import.title`, `import.upload`, `import.mapping`, `import.validation`, `import.execute`
- `import.downloadTemplate`, `import.selectFile`, `import.dragDrop`
- `import.validRows`, `import.unknownMeters`, `import.duplicates`, `import.invalidDates`
- `import.success`, `import.partialSuccess`, `import.error`

---

## Abhaengigkeiten

- **Neues npm-Paket**: `xlsx` (SheetJS) fuer Excel-Support. Falls nur CSV benoetigt wird, entfaellt dieses Paket.
- **Keine DB-Migration noetig**: `meter_readings` und `meter_period_totals` existieren bereits mit allen benoetigten Spalten. `capture_method = "csv_import"` nutzt das bestehende Text-Feld.

---

## Reihenfolge der Implementierung

1. CSV-Parser mit Auto-Erkennung und Datumskonvertierung
2. Import-Hook mit Validierung und Batch-Insert
3. Import-Dialog mit Stepper-UI (Upload, Mapping, Validierung, Ergebnis)
4. Integration in EnergyData-Seite (Button + Dialog)
5. CSV-Vorlage zum Download
6. Uebersetzungen ergaenzen
7. Excel- und CSV als Beispieldatei per Link zum Download anbieten