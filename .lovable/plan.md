## Ziel
Ein neues Widget im Tenant-Dashboard, das die wichtigsten KPIs des Gain-Sharings kompakt anzeigt und auf die Vollansicht `/savings-share` verlinkt. Das Widget wird nur angezeigt, wenn das Modul `gain_sharing` für den Tenant aktiviert ist.

## Angezeigte KPIs
Datenquelle: `tenant_savings_contracts` + `tenant_savings_baselines` + `tenant_savings_settlements` (identisch zu `SavingsShareReadOnly`).

Vier KPI-Kacheln:
1. **Vertragsstatus** – Badge (Entwurf/Aktiv/Pausiert/Beendet) + Baseline-Jahr → Start-Jahr.
2. **Baseline gesamt** – Σ `baseline_kwh_normalized` in kWh; Untertext: schwächste Datenqualität + Ø Monatsabdeckung.
3. **Einsparung letzte Abrechnung** – `total_savings_eur` der neuesten Settlement-Periode; Untertext: Jahr + Status-Badge.
4. **Kumulierte Einsparung** – Σ `total_savings_eur` aller Settlements mit Status ∈ (approved, invoiced, paid); Untertext: „davon Tenant-Anteil: X €" (Σ `tenant_retained_eur`).

Darunter:
- Mini-Balkendiagramm (recharts, stacked) der letzten bis zu 5 Abrechnungsjahre: Tenant-Anteil (grün) + AICONO-Anteil (teal).
- Button „Details ansehen" → navigiert nach `/savings-share`.

Leer-Zustände:
- Kein Vertrag: Card mit Hinweis „Noch kein Gain-Sharing-Vertrag hinterlegt" + Link.
- Vertrag ohne Settlements: KPI 3 & 4 zeigen „–"; Chart-Bereich zeigt „Noch keine Abrechnungen".

Alle Zahlen mit `toLocaleString("de-DE")`.

## Umsetzung

### 1. Neue Datei `src/components/dashboard/SavingsShareWidget.tsx`
- Props: `WidgetProps` (locationId wird ignoriert – Gain-Sharing ist tenantweit).
- Nutzt `useTenant()` für `tenant.id`.
- `useQuery` (`queryKey: ["savings-share-widget", tenant.id]`) lädt neuesten Contract + Baselines + Settlements (Logik analog `SavingsShareReadOnly`, inline gehalten).
- Card mit Titel „Gain-Sharing", `Euro`-Icon, KPI-Grid + Mini-Chart.
- Bei Loading: Skeleton. Bei Fehler: kompakte Fehlermeldung.

### 2. Sichtbarkeitssteuerung über Modul (zentrale Stelle)
`src/pages/DashboardContent.tsx` – nur diese Datei wird angepasst, damit die Filterung konsistent zu bestehenden modul-gebundenen Widgets erfolgt:

- In `WIDGET_MODULE_MAP` neuen Eintrag ergänzen:
  ```ts
  savings_share: "gain_sharing",
  ```
  → `filteredVisibleWidgets` blendet das Widget automatisch aus, wenn `isModuleEnabled("gain_sharing")` `false` liefert. Damit erscheint es weder im Dashboard-Grid noch im Expand-Dialog.

- Optional (kein Blocker): der Dashboard-Customizer zeigt den Eintrag weiterhin, kann aber später über dieselbe Map gefiltert werden. Für diesen Task nicht erforderlich, da `useModuleGuard` bereits alle Anzeige-Entscheidungen trifft.

### 3. Registrierung in `src/pages/DashboardContent.tsx`
- Lazy-Import: `const SavingsShareWidget = lazy(() => import("@/components/dashboard/SavingsShareWidget"));`
- `WIDGET_COMPONENTS`: `savings_share: SavingsShareWidget`.
- `WIDGET_HEIGHT_LIMITS`: `savings_share: { min: 340, max: 520 }`.

### 4. Default-Widget-Eintrag in `src/hooks/useDashboardWidgets.tsx`
- `{ widget_type: "savings_share", position: 17, is_visible: true }` — initial sichtbar; wird durch Modul-Filter ausgeblendet, solange `gain_sharing` deaktiviert ist.

### 5. Anzeige-Label im Customizer
Label „Gain-Sharing KPIs" für `savings_share` in der Labels-Map des `DashboardCustomizer` bzw. den i18n-Übersetzungen ergänzen (DE/EN/ES/NL).

### Kein DB-/RLS-Change
Widget liest bestehende Tabellen mit vorhandenen Policies – keine Migration nötig.

## Technische Notizen
- Modul-Check läuft über den bestehenden `useModuleGuard`-Mechanismus (`WIDGET_MODULE_MAP` → `isModuleEnabled`). Damit ist die Sichtbarkeit strikt an das im Super-Admin/Partner freigeschaltete Modul `gain_sharing` gekoppelt – konsistent mit Route-Guard `/savings-share`.
- Widget respektiert Widget-Size über responsives Grid (`grid-cols-2 md:grid-cols-4` bei full, sonst `grid-cols-2`).
- Kein Location-Bezug – Inhalt ändert sich nicht beim Standort-Filter.
- Chart via `recharts` (bereits im Projekt), Y-Achse in €, Tooltip mit deutscher Formatierung.
