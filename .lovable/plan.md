
# Projekt-Optimierung: Code-Splitting und Lazy Loading

## Problem
Der Dev-Server wird instabil, weil zu viele Module gleichzeitig geladen werden. Hauptursachen:
- **DashboardContent.tsx** und **Demo.tsx** importieren alle 16 Widget-Komponenten eagerly (inkl. Recharts, Leaflet, Three.js)
- **translations.ts** ist 5.572 Zeilen gross und wird synchron geladen
- Mehrere Seiten importieren schwere Bibliotheken (Recharts, Three.js, Leaflet) direkt statt lazy

## Optimierungsstrategie

### 1. Dashboard-Widgets lazy importieren
**DashboardContent.tsx** und **Demo.tsx** importieren alle 16 Widgets direkt. Da `LazyWidget` bereits viewport-basiertes Rendering macht, fehlt nur der entscheidende Schritt: die Widgets selbst per `React.lazy()` laden.

- Alle Widget-Imports in `DashboardContent.tsx` durch `lazy()` ersetzen
- Gleiches fuer `Demo.tsx` (identische Widget-Liste)
- Dadurch laedt Vite nur die Widgets, die tatsaechlich sichtbar werden

### 2. Schwere Seiten-Imports optimieren
Folgende Seiten importieren Recharts/Three.js direkt und sollten ihre schweren Teile lazy laden:

- **ArbitrageTrading.tsx** - Recharts direkt importiert
- **ChargePointDetail.tsx** - Recharts direkt importiert  
- **SuperAdminStatistics.tsx** - Recharts direkt importiert
- **LocationDetail.tsx** - importiert FloorPlan3DViewer (Three.js)

Loesung: Chart-Komponenten in separate Dateien auslagern und per `lazy()` laden, oder die Recharts-Imports dynamisch gestalten.

### 3. Demo.tsx DashboardContent wiederverwenden
`Demo.tsx` ist eine fast identische Kopie von `DashboardContent.tsx` mit denselben 16 Widget-Imports. Statt doppeltem Code sollte Demo.tsx das bereits lazy-geladene DashboardContent wiederverwenden.

### 4. Vite-Konfiguration: Weitere Chunk-Trennung
Aktuelle `manualChunks` trennt bereits translations, leaflet, recharts, three. Zusaetzlich:
- `xlsx` in eigenen Chunk (schwere Bibliothek, nur fuer Import/Export)
- `date-fns` in eigenen Chunk (wird breit genutzt)

### 5. DashboardSidebar-Import optimieren
`DashboardSidebar` wird von ~20 Seiten direkt importiert. Da es beim initialen Seitenload immer sichtbar ist, bleibt es eager - aber es importiert viele Lucide-Icons. Die Icon-Imports sind bereits tree-shakeable, hier ist kein Handlungsbedarf.

## Technische Details

### Widget Lazy-Loading Pattern (DashboardContent.tsx)
```typescript
// Vorher: 16 eager imports
import EnergyChart from "@/components/dashboard/EnergyChart";
import CostOverview from "@/components/dashboard/CostOverview";
// ...

// Nachher: lazy imports
const EnergyChart = lazy(() => import("@/components/dashboard/EnergyChart"));
const CostOverview = lazy(() => import("@/components/dashboard/CostOverview"));
// ...
```

`LazyWidget` bekommt einen zusaetzlichen `Suspense`-Wrapper, damit lazy-geladene Widgets korrekt rendern.

### Erwartete Dateiaenderungen
1. **src/pages/DashboardContent.tsx** - 16 Imports auf `lazy()` umstellen
2. **src/pages/Demo.tsx** - DashboardContent wiederverwenden oder ebenfalls lazy imports
3. **src/components/dashboard/LazyWidget.tsx** - `Suspense` fuer lazy-Components einbauen
4. **vite.config.ts** - `xlsx` und `date-fns` als separate Chunks
5. **src/pages/ArbitrageTrading.tsx** - Recharts-Chart in lazy-Subcomponent
6. **src/pages/ChargePointDetail.tsx** - Recharts-Chart in lazy-Subcomponent
7. **src/pages/SuperAdminStatistics.tsx** - Recharts-Chart in lazy-Subcomponent

### Erwartetes Ergebnis
- Dev-Server verarbeitet deutlich weniger Module beim initialen Load
- Nur sichtbare Widgets loesen ihre Chunk-Downloads aus
- Recharts/Three.js/Leaflet werden erst bei Bedarf geladen
- Gesamter initialer Bundle ~40-50% kleiner
