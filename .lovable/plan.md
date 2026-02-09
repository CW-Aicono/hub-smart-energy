
# Umsetzung der Quick-Win Anforderungen aus der Bewertungsmatrix

Basierend auf der Analyse der Bewertungsmatrix und dem aktuellen Stand des Projekts werden folgende Punkte umgesetzt, die ohne externe Abhängigkeiten oder zusätzliche Klärung realisierbar sind.

---

## 1. CSV/Excel-Export fuer Verbrauchsdaten

Aktuell gibt es keinen Datenexport. Es wird ein Export-Button in die relevanten Dashboard-Widgets (Energieverbrauch, Kostenübersicht) eingebaut.

**Umfang:**
- Export-Button im `EnergyChart`-Widget fuer CSV-Download der Verbrauchsdaten
- Export-Button im `CostOverview`-Widget
- Wiederverwendbare Hilfsfunktion `downloadCSV()` in einer neuen Datei `src/lib/exportUtils.ts`

---

## 2. Jahresverbrauchsprognose-Widget

Neues Dashboard-Widget, das basierend auf den bisherigen Monatsdaten eine Hochrechnung auf das Gesamtjahr zeigt (linearer Trend ab Maerz).

**Umfang:**
- Neue Komponente `src/components/dashboard/ForecastWidget.tsx`
- Liniendiagramm mit Ist-Daten und gestrichelter Prognoselinie (Recharts)
- Registrierung als neues Widget (`forecast`) im Dashboard-System (`useDashboardWidgets`, `DashboardCustomizer`, `Index.tsx`)

---

## 3. CO2-Bilanzierung erweitern (Scope 1 & 2)

Das bestehende Nachhaltigkeits-Widget wird um eine Scope-1/Scope-2-Aufschluesselung erweitert.

**Umfang:**
- Erweiterung der Mock-Daten um Scope-1 (direkte Emissionen: Gas, Heizöl) und Scope-2 (indirekte: Strom, Fernwaerme)
- Visuelle Aufschluesselung im `SustainabilityKPIs`-Widget mit gestapeltem Balkendiagramm
- Zielwert-Vergleich je Scope

---

## 4. Messstellen-Verwaltung (herstellerunabhaengig)

Aktuell sind Sensoren an Loxone gekoppelt. Es wird eine Moeglichkeit geschaffen, Messstellen/Zaehler manuell und herstellerunabhaengig anzulegen.

**Umfang:**
- Neue DB-Tabelle `meters` (id, location_id, tenant_id, name, meter_number, energy_type, unit, medium, installation_date, notes)
- Neue Seite bzw. Bereich in der Standort-Detailansicht: "Messstellen / Zaehler"
- CRUD-Dialoge: Zaehler anlegen, bearbeiten, loeschen
- RLS-Policies basierend auf tenant_id

---

## 5. Alarmierungs-Konfiguration (Grenzwerte)

Aktuell sind Alerts statisch in Mock-Daten. Es wird eine Moeglichkeit geschaffen, Grenzwerte/Schwellenwerte pro Messstelle zu definieren.

**Umfang:**
- Neue DB-Tabelle `alert_rules` (id, tenant_id, location_id, meter_id, energy_type, threshold_value, threshold_type [above/below], notification_email, is_active)
- Konfigurationsbereich in den Einstellungen oder der Standort-Detailansicht
- Alert-Regel CRUD

---

## Technische Details

### Neue Dateien
- `src/lib/exportUtils.ts` - CSV-Export-Hilfsfunktionen
- `src/components/dashboard/ForecastWidget.tsx` - Prognose-Widget
- `src/components/locations/MeterManagement.tsx` - Zaehler-Verwaltung
- `src/components/locations/AddMeterDialog.tsx` - Zaehler anlegen
- `src/components/locations/EditMeterDialog.tsx` - Zaehler bearbeiten
- `src/hooks/useMeters.tsx` - Hook fuer Zaehler-CRUD

### Geaenderte Dateien
- `src/components/dashboard/EnergyChart.tsx` - Export-Button hinzufuegen
- `src/components/dashboard/CostOverview.tsx` - Export-Button hinzufuegen
- `src/components/dashboard/SustainabilityKPIs.tsx` - Scope 1/2 Erweiterung
- `src/components/dashboard/DashboardCustomizer.tsx` - Neue Widget-Labels
- `src/hooks/useDashboardWidgets.tsx` - Neue Default-Widgets
- `src/pages/Index.tsx` - Neue Widget-Komponenten registrieren
- `src/pages/LocationDetail.tsx` - Messstellen-Bereich einbinden
- `src/data/mockData.ts` - Erweiterte Mock-Daten (Scope 1/2, Prognose)

### Datenbank-Migrationen
1. Tabelle `meters` mit RLS-Policies
2. Tabelle `alert_rules` mit RLS-Policies

### Reihenfolge
1. DB-Migrationen (meters, alert_rules)
2. Export-Utilities + CSV-Export in bestehende Widgets
3. Prognose-Widget
4. CO2-Scope-Erweiterung
5. Messstellen-Verwaltung
6. Alert-Konfiguration
