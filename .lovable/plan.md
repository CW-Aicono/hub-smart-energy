## Ziel

Einheiten-Auswahl im Gerätedialog übersichtlicher machen und Gewichtseinheiten (für CO₂-Bilanzen etc.) ergänzen.

## Vorschlag: Zwei gekoppelte Dropdowns

Statt einer langen gruppierten Liste zwei Dropdowns nebeneinander:

1. **Kategorie** (Pflicht, klein) — Leistung/Energie, Temperatur, Feuchte/Anteil, Druck, Helligkeit, Strom/Spannung, Durchfluss/Volumen, **Gewicht/Masse (neu)**, Zeit, Zähler/Sonstiges
2. **Einheit** (gefiltert nach Kategorie) — z. B. bei „Gewicht": `g`, `kg`, `t`, `mg`; bei „Gewicht pro Zeit" optional `kg/h`

### Warum zwei Dropdowns statt Alternativen

- **Searchable Combobox** (Alternative): schneller für Power-User, aber für Laien-Admins schlechter — sie wissen oft nicht, ob die Einheit „Wh" oder „kWh" heißt. Kategorie-first führt sie hin.
- **Zwei Dropdowns** matchen zudem gut zur bestehenden `SOURCE_UNIT_GROUPS`-Struktur → minimaler Refactor.

Empfehlung: **zwei Dropdowns**. Bei nur einer Einheit pro Kategorie (z. B. Helligkeit → lx) wird das zweite Dropdown automatisch vorbelegt, bleibt aber sichtbar zur Klarheit.

## Neue Kategorie „Gewicht / Masse"


| value | label           |
| ----- | --------------- |
| `g`   | g (Gramm)       |
| `kg`  | kg (Kilogramm)  |
| `t`   | t (Tonne)       |
| `mg`  | mg (Milligramm) |


Für Raten (falls später gebraucht): `kg/h`, `t/a` — vorerst nicht, um Scope klein zu halten.

`deriveEnergyUnit()` erweitern: bei Gewichtseinheiten liefert der kumulative Zählerwert dieselbe Einheit zurück (analog zu °C/%).

CO₂-spezifische Etiketten (`kg CO₂`, `t CO₂/a`) werden **nicht** als eigene Einheiten geführt — CO₂ ist ein Kontext des Zählers/Sensors, nicht der physikalischen Einheit. Der Anzeigename des Geräts („CO2 Ersparnis") liefert den Kontext, die Einheit bleibt `kg`/`t`.

## Umsetzung (Frontend-only)

1. `**src/lib/sensorUnits.ts**`
  - Kategorie „Gewicht / Masse" mit obigen Einträgen ergänzen.
  - Helper `getUnitCategory(value)` und `getUnitsForCategory(categoryLabel)` exportieren.
  - `deriveEnergyUnit`: Passthrough für Gewichts- und weitere Nicht-Energie-Einheiten (schon default vorhanden, nur verifizieren).
2. **Neue Komponente `src/components/locations/SourceUnitPicker.tsx**`
  - Props: `value: string`, `onChange(value: string)`.
  - Innen: lokaler `category`-State (aus `value` abgeleitet), zwei `Select`-Komponenten nebeneinander (responsive: gestapelt auf schmalen Dialogen).
  - Änderung der Kategorie → erste Einheit der Kategorie automatisch setzen.
3. **Ersetzen der bestehenden Einheiten-Selects** in
  - `EditMeterDialog.tsx`
  - `AddMeterDialog.tsx`
  - `BulkEditMetersDialog.tsx`
   jeweils durch `<SourceUnitPicker />`. Helper-/Beschreibungstexte bleiben unverändert.

## Nicht enthalten (Nachfrage bei Bedarf)

- Umrechnungen zwischen Einheiten derselben Kategorie (kg ↔ t)
- CO₂-spezifische Widgets/Reports
- Automatische Kategorie-Vorschläge aus dem Gerätenamen

Soll ich so umsetzen, oder Gewicht/Masse-Set anders schneiden (z. B. `kg/h`, `t/a` gleich mit rein)?  
  
Antwort: `kg/h`, `t/a` und weitere bitte gleich mit rein, dann ist das fertig