
## Ziel

In allen Dashboard-Widgets, die eine Zeitraum-Navigation (`< KW 23, 2026 >`) zeigen, wird das Label **klickbar**. Ein Klick öffnet einen **Date-Picker**, mit dem der Nutzer direkt zu einem beliebigen Tag / Woche / Monat / Quartal / Jahr springen kann — statt sich mit den Pfeil-Buttons durchklicken zu müssen.

## Betroffene Widgets

Alle drei Dashboard-Widgets, die `useDashboardFilter().selectedOffset` nutzen und identische Navigation rendern:

1. `src/components/dashboard/EnergyChart.tsx` (Energieverbrauch)
2. `src/components/dashboard/PvForecastWidget.tsx` (PV-Prognose)
3. `src/components/dashboard/CustomWidget.tsx` (alle vom User gebauten Custom-Widgets)

Da alle drei Widgets `setSelectedOffset` aus `useDashboardFilter` setzen, propagiert sich die Datums-Auswahl **automatisch** auf alle Widgets gleichzeitig (Dashboard-weiter Filter, wie bisher).

## Umsetzung

### 1. Neue gemeinsame Komponente

`src/components/dashboard/PeriodPickerLabel.tsx`

- Rendert das bisherige `<span>{periodLabel}</span>` als `<button>` innerhalb eines shadcn `Popover`.
- Popover-Content: shadcn `Calendar` (`mode="single"`, `pointer-events-auto`, `locale=de`, `weekStartsOn=1`, `ISOWeek`).
- Bei `onSelect(date)`:
  - berechnet aus `selectedPeriod` + gewähltem Datum den neuen **Offset relativ zum heutigen Tag** (z. B. `differenceInCalendarWeeks(date, today)` für `week`, analog `Days/Months/Quarters/Years`) und ruft `setSelectedOffset(newOffset)`.
  - schließt den Popover.
- Für Period `"all"` ist der Picker deaktiviert (Button rendert ein nicht-klickbares Label, wie heute).
- Übernimmt visuell exakt das bisherige Styling (`text-xs text-muted-foreground min-w-[160px] text-center`), bekommt zusätzlich `hover:text-foreground cursor-pointer` als Affordance.

### 2. Integration

In allen drei Widgets wird die Zeile

```tsx
<span className="text-xs ...">{periodLabel}</span>
```

ersetzt durch

```tsx
<PeriodPickerLabel period={period} refDate={refDate} label={periodLabel} />
```

(`period`, `refDate`, `periodLabel` sind in allen drei Widgets bereits lokal berechnet.)

Keine Änderung an Pfeil-Buttons, `useDashboardFilter`, Datenfluss oder Backend.

### 3. Locale & Format

- Verwendet `date-fns` mit `de`-Locale (bereits im Projekt vorhanden).
- Kalender zeigt KW-Spalte (`ISOWeek`) — passt zur bisherigen `KW 23, 2026`-Anzeige.
- Bei `quarter` / `year` wird Tagesgenauigkeit im Picker akzeptiert, intern aber auf den jeweiligen Zeitraum gemappt (Quartal/Jahr, in dem das Datum liegt).

### 4. Verifikation

- Klick auf `KW 23, 2026` öffnet Kalender → Auswahl `15.03.2026` → Label springt auf `KW 11, 2026`, alle drei Widgets aktualisieren synchron.
- Klick im Modus `Tag` / `Monat` / `Quartal` / `Jahr` → identisches Verhalten, passender Zeitraum-Sprung.
- `Alle`-Modus: Label nicht klickbar.
- Bestehende Pfeil-Navigation funktioniert unverändert.

## Nicht enthalten

- Keine Änderungen an Geschäftslogik, Aggregation oder RPCs.
- Keine Änderungen an Super-Admin- oder Partner-Widgets (nur Tenant-Dashboard-Widgets nutzen `useDashboardFilter`).
- Kein Refactor der drei Widgets darüber hinaus.
