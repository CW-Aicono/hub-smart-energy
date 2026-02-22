
# Dynamische Strompreise pro Liegenschaft

## Konzept

Ein dynamischer Stromtarif bedeutet: Statt eines festen Preises pro kWh wird der aktuelle EPEX-Spotpreis (Day-Ahead) als Basis genommen, zzgl. eines festen Aufschlags (Netzentgelte, Umlagen, Marge des Lieferanten). Die Formel lautet:

```text
Effektiver Preis = Spotpreis (ct/kWh) + Aufschlag (ct/kWh)
```

## Aenderungen

### 1. Datenbank: Neue Spalten in `energy_prices`

Zwei neue Spalten auf der bestehenden Tabelle `energy_prices`:

- **`is_dynamic`** (boolean, default `false`) -- Markiert, ob dieser Eintrag ein dynamischer Spotpreis-Tarif ist
- **`spot_markup_per_unit`** (numeric, default `0`) -- Fester Aufschlag auf den Spotpreis in EUR pro Einheit (z.B. 0.12 EUR/kWh fuer Netzentgelte, Umlagen, Marge)

Bei `is_dynamic = true` wird `price_per_unit` ignoriert und stattdessen der aktuelle Spotpreis + Aufschlag verwendet.

### 2. UI: Dialog "Energiepreis hinzufuegen/bearbeiten"

**Datei:** `src/components/locations/EnergyPriceManagement.tsx`

- Nur bei Energietraeger "Strom" erscheint ein neuer Switch: **"Dynamischer Strompreis (Boerse)"**
- Wenn aktiviert:
  - Das Feld "Preis pro kWh" wird ausgeblendet
  - Stattdessen erscheint ein Feld **"Aufschlag pro kWh (EUR)"** (Netzentgelte, Umlagen, Marge)
  - Ein Hinweistext erklaert: "Der Strompreis wird automatisch anhand des aktuellen EPEX Day-Ahead Spotpreises berechnet."
- In der Tabelle wird bei dynamischen Eintraegen statt des festen Preises angezeigt:
  - "Spotpreis + 0,12 EUR/kWh" (mit dem konfigurierten Aufschlag)
  - Optional: Der aktuelle effektive Preis in Klammern

### 3. Hook: `useEnergyPrices` erweitern

**Datei:** `src/hooks/useEnergyPrices.tsx`

- Interface `EnergyPrice` um `is_dynamic` und `spot_markup_per_unit` erweitern
- `addPrice` und `updatePrice` um die neuen Felder erweitern
- `getActivePrice` anpassen: Bei `is_dynamic = true` den aktuellen Spotpreis aus `useSpotPrices` holen und + Aufschlag zurueckgeben

### 4. Kostenberechnung anpassen

**Dateien:** `src/components/dashboard/CostOverview.tsx`, `src/components/dashboard/SankeyWidget.tsx`

- Der `priceLookup` muss pruefen, ob ein dynamischer Preis vorliegt
- Bei dynamischen Preisen: Aktuellen Spotpreis aus der `spot_prices`-Tabelle holen und den Aufschlag addieren
- Fuer historische Berechnungen (Vorperiode): Den zum jeweiligen Zeitpunkt gueltigen Spotpreis nutzen

### 5. Formdata und Validierung

- Neues Formfeld `is_dynamic` (boolean, default false) und `spot_markup_per_unit` (string)
- Bei `is_dynamic = true` wird `price_per_unit` auf 0 gesetzt (Platzhalter), da der echte Preis dynamisch ist
- Validierung: Aufschlag muss >= 0 sein

## Technische Details

### Migration SQL

```sql
ALTER TABLE energy_prices
  ADD COLUMN is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN spot_markup_per_unit numeric NOT NULL DEFAULT 0;
```

### Effektive Preisberechnung

Fuer die Kostenberechnung wird in `CostOverview` und `SankeyWidget` der `priceLookup` erweitert:
- Fester Tarif: `price_per_unit` direkt verwenden (wie bisher)
- Dynamischer Tarif: Aktueller Spotpreis (EUR/MWh / 1000 = EUR/kWh) + `spot_markup_per_unit`

### Tabellenanzeige

Dynamische Eintraege werden visuell gekennzeichnet:
- Badge "Dynamisch" oder Blitz-Icon
- Anzeige: "Spot + 0,12 EUR/kWh" statt eines festen Preises
