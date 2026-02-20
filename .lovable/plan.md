

## Spotpreis-Anzeige: 3h Vergangenheit + 48h Zukunft

### Problem
Aktuell zeigt der Graph 12 Stunden in die Vergangenheit, wodurch der Fokus auf den zukuenftigen Preisverlauf verloren geht. Die verfuegbaren Day-Ahead-Preise (bis zu 48h voraus) werden nicht vollstaendig dargestellt.

### Loesung

Drei Dateien muessen angepasst werden:

---

### 1. Edge Function anpassen (`supabase/functions/fetch-spot-prices/index.ts`)

Die API-Abfrage wird erweitert, um Daten von gestern bis uebermorgen abzudecken:
- `startDate`: heute - 1 Tag (bleibt, um 3h Rueckblick abzudecken)
- `endDate`: heute + **2 Tage** statt +1 Tag, damit volle 48h Zukunftsdaten verfuegbar sind

### 2. Hook anpassen (`src/hooks/useSpotPrices.tsx`)

- Der `since`-Parameter wird geaendert: statt `now - 48h` (reiner Rueckblick) wird `now - 3h` als Startpunkt gesetzt
- Zusaetzlich wird eine obere Grenze eingefuegt: `now + 48h`
- So werden genau die relevanten Daten geladen: 3h zurueck + 48h voraus

### 3. Chart-Darstellung anpassen

**SpotPriceWidget** (`src/components/dashboard/SpotPriceWidget.tsx`):
- `startCutoff` von `now - 12h` auf `now - 3h` aendern
- Titel von "48h" auf passendere Beschreibung anpassen

**ArbitrageDashboard** (`src/pages/ArbitrageTrading.tsx`):
- Gleiche Anpassung des `startCutoff` auf `now - 3h`

---

### Technische Details

```
Zeitachse (neu):
  |----3h----|--NOW--|------------------48h------------------>
  Vergangenheit       Zukunft
  (grau)              (Primaerfarbe)
```

**useSpotPrices.tsx** - Query-Aenderung:
- `since`: `new Date(Date.now() - 3 * 60 * 60 * 1000)` statt `hours * 60 * 60 * 1000`
- Neuer Filter: `.lte("timestamp", new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString())`

**fetch-spot-prices/index.ts** - API-Range:
- `endDate.setDate(endDate.getDate() + 2)` statt `+ 1`

