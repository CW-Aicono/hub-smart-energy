

# Widget-Designer – Eigene Widgets erstellen und im Dashboard anzeigen

## Übersicht

Nutzer (Admins) können im neuen Tab **"Widget-Designer"** unter Einstellungen eigene Dashboard-Widgets visuell zusammenbauen – ohne Code. Jedes Custom Widget wählt Datenquellen (Zähler), einen Diagrammtyp und optionale Schwellenwerte. Die erstellten Widgets erscheinen dann im regulären Dashboard neben den System-Widgets und können wie gewohnt per DashboardCustomizer positioniert, skaliert und ein-/ausgeblendet werden.

## Was der Nutzer sieht

### Widget-Designer Tab (Einstellungen)
- Übersicht aller eigenen Widgets als Karten-Grid (Name, Typ-Icon, Vorschau-Thumbnail)
- Button **"Neues Widget erstellen"** öffnet den Designer-Dialog
- Jede Karte hat Aktionen: Bearbeiten, Duplizieren, Löschen

### Designer-Dialog (Schritt-für-Schritt)
1. **Grundeinstellungen**: Name, Icon (aus Icon-Palette), Farbe
2. **Diagrammtyp wählen**: Liniendiagramm, Balkendiagramm, Gauge/Tacho, KPI-Kachel (Einzelwert mit Trend), Tabelle
3. **Datenquellen**: Zähler aus der eigenen Liegenschaft auswählen (Multi-Select, gruppiert nach Energieträger). Aggregation wählen (Summe, Durchschnitt, Maximum, Minimum)
4. **Darstellung**: Einheitenformat (kWh, kW, €, m³), Farbzuordnung pro Reihe, optionale Schwellenwert-Linien (z.B. "Zielverbrauch 500 kWh"), Y-Achsen-Bereich (auto oder manuell)
5. **Vorschau**: Live-Vorschau des Widgets mit echten Daten

### Im Dashboard
- Custom Widgets erscheinen als `custom_<id>` im Widget-System
- Nutzen denselben Zeitfilter und Liegenschaftsfilter wie alle anderen Widgets
- Vollständig integriert in den DashboardCustomizer (Drag & Drop, Resize, Toggle)

## Technische Umsetzung

### 1. Neue Datenbank-Tabelle `custom_widget_definitions`

```sql
CREATE TABLE public.custom_widget_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'BarChart3',
  color TEXT DEFAULT '#3b82f6',
  chart_type TEXT NOT NULL CHECK (chart_type IN ('line', 'bar', 'gauge', 'kpi', 'table')),
  config JSONB NOT NULL DEFAULT '{}',
  -- config enthält: meter_ids[], aggregation, unit, thresholds[], y_range, series_colors{}
  is_shared BOOLEAN DEFAULT true,  -- für alle Nutzer im Tenant sichtbar
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_widget_definitions ENABLE ROW LEVEL SECURITY;
-- RLS: Tenant-basiert, nur Admins können erstellen/bearbeiten
```

Die `config`-JSONB-Struktur:
```json
{
  "meter_ids": ["uuid1", "uuid2"],
  "aggregation": "sum",
  "unit": "kWh",
  "thresholds": [{ "value": 500, "label": "Ziel", "color": "#ef4444" }],
  "y_range": { "min": null, "max": null },
  "series_colors": { "uuid1": "#3b82f6", "uuid2": "#10b981" }
}
```

### 2. Neue Dateien

| Datei | Zweck |
|---|---|
| `src/components/settings/WidgetDesigner.tsx` | Tab-Hauptkomponente: Liste aller Custom Widgets |
| `src/components/settings/WidgetDesignerDialog.tsx` | Mehrstufiger Erstellungs-/Bearbeitungsdialog |
| `src/components/settings/WidgetPreview.tsx` | Live-Vorschau im Designer |
| `src/components/dashboard/CustomWidget.tsx` | Generische Render-Komponente für Custom Widgets im Dashboard |
| `src/hooks/useCustomWidgetDefinitions.ts` | CRUD-Hook für `custom_widget_definitions` |

### 3. Änderungen an bestehenden Dateien

| Datei | Änderung |
|---|---|
| `src/pages/Settings.tsx` | Neuer Tab "Widget-Designer" mit `LayoutGrid`-Icon hinzufügen |
| `src/pages/DashboardContent.tsx` | Custom Widgets aus DB laden und in `WIDGET_COMPONENTS` dynamisch registrieren |
| `src/hooks/useDashboardWidgets.tsx` | Custom Widgets in `DEFAULT_WIDGETS` dynamisch ergänzen |
| `src/components/dashboard/DashboardCustomizer.tsx` | Labels für Custom Widgets aus deren `name`-Feld anzeigen |

### 4. Rendering-Logik im Dashboard

`CustomWidget.tsx` ist eine generische Komponente, die basierend auf `chart_type` den passenden Recharts-Chart rendert:
- **line/bar**: `<LineChart>` / `<BarChart>` mit den konfigurierten Zählern als Reihen
- **gauge**: Wiederverwendung der bestehenden `AnalogGauge`-Komponente
- **kpi**: Einzelwert-Karte mit Trend-Pfeil (aktueller vs. vorheriger Zeitraum)
- **table**: Tabellarische Darstellung der Zählerwerte

Alle Varianten nutzen den bestehenden `useEnergyData`-Hook mit den konfigurierten `meter_ids`.

### 5. Integration in den Widget-Flow

```text
Custom Widget Definition (DB)
        │
        ▼
useDashboardWidgets ──► erkennt "custom_<uuid>" widget_types
        │                    und lädt Definition aus custom_widget_definitions
        ▼
DashboardContent ──► rendert <CustomWidget definition={...} />
        │
        ▼
DashboardCustomizer ──► zeigt Custom Widgets mit ihrem Namen statt widget_type
```

Beim Erstellen eines neuen Custom Widgets wird automatisch ein `dashboard_widgets`-Eintrag mit `widget_type = "custom_<uuid>"` für alle Tenant-Nutzer (bei `is_shared = true`) oder nur den Ersteller erzeugt.

## Dateien-Übersicht

**Neu erstellen:**
- `src/components/settings/WidgetDesigner.tsx`
- `src/components/settings/WidgetDesignerDialog.tsx`
- `src/components/settings/WidgetPreview.tsx`
- `src/components/dashboard/CustomWidget.tsx`
- `src/hooks/useCustomWidgetDefinitions.ts`

**Ändern:**
- `src/pages/Settings.tsx`
- `src/pages/DashboardContent.tsx`
- `src/hooks/useDashboardWidgets.tsx`
- `src/components/dashboard/DashboardCustomizer.tsx`

**Migration:**
- Neue Tabelle `custom_widget_definitions` mit RLS-Policies

