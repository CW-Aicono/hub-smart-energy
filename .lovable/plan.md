## Ziel

Desktop-Widgets im Dashboard nur anzeigen, wenn sie für den aktuellen Tenant / die aktuelle Liegenschaft sinnvoll sind — also nur wenn entsprechende Daten, Zähler, Verträge oder Module vorhanden sind. Aktuell werden Widgets nur nach Modul-Aktivierung und User-Sichtbarkeit gefiltert (`WIDGET_MODULE_MAP` + `visibleWidgets`), aber nicht danach, ob überhaupt Daten dahinterliegen.

## Ansatz

Zusätzlich zum bestehenden Modul-Filter in `DashboardContent.tsx` wird eine zweite Filter-Ebene eingeführt: **Datenvoraussetzungen** (Requirements). Ein Widget wird nur gerendert, wenn seine Requirement-Funktion `true` liefert. Die Prüfung passiert einmal beim Laden über einen zentralen Hook `useWidgetAvailability(selectedLocationId)`, der alle nötigen Signale bündelt (leichte COUNT-Queries, gecacht via React-Query, staleTime 5 min).

Widgets, die die Voraussetzung nicht erfüllen, werden:
- im normalen Dashboard **ausgeblendet**
- im `DashboardCustomizer` weiterhin sichtbar, aber mit Badge „Keine Daten" und Hinweis, damit der User versteht, warum das Widget nicht erscheint (kein stilles Verschwinden).

## Widget → Anzeigebedingung

| Widget | Bedingung |
|---|---|
| `pv_forecast` | mindestens eine PV-Anlage (`location_energy_sources` type `pv`) oder ein PV-Zähler (`meters.direction`/`role = pv`) im Scope |
| `cost_overview` | mindestens ein Eintrag in `energy_prices` **oder** `tenant_electricity_tariffs` für den Tenant |
| `spot_price` | dynamischer Stromtarif aktiv (`energy_prices.pricing_model = 'dynamic'` o. ä.) **oder** Modul `arbitrage_trading` aktiv **mit** mindestens einer Strategie in `arbitrage_strategies` |
| `arbitrage_ai` | Modul `arbitrage_trading` aktiv **und** mindestens eine aktive Strategie |
| `floor_plan` / `floor_plan_explorer` | mindestens ein Grundriss vorhanden (`floors` bzw. `locations.floor_plan_url`) |
| `savings_share` | Modul `gain_sharing` aktiv **und** mindestens ein `tenant_savings_contracts`-Eintrag |
| `ppa_fleet` | mindestens ein `ppa_contracts`-Eintrag |
| `weather_normalization` | mindestens ein Wärme-/Gaszähler vorhanden |
| `sustainability_kpis` | mindestens ein Zähler mit Energiedaten der letzten 30 Tage |
| `integration_errors` | ungelöste Integration-Errors vorhanden |
| `energy_gauge`, `energy_chart`, `pie_chart`, `sankey`, `forecast`, `anomaly` | mindestens ein aktiver Zähler im Scope |
| `alerts_list` | Modul `alerts` aktiv (bereits abgedeckt) — keine zusätzliche Datenprüfung |
| `location_map` | mindestens 2 Liegenschaften (bereits so implementiert — beibehalten) |
| `weather` | immer sichtbar (Wetter unabhängig von Zählern) |

Wenn eine Liegenschaft ausgewählt ist, prüfen die Requirements auf Location-Ebene; ohne Auswahl auf Tenant-Ebene.

## Technische Umsetzung

**Neue Datei:** `src/hooks/useWidgetAvailability.tsx`
- Führt parallel leichte `select ... limit 1` / `head:true, count:'exact'` Queries aus (Zähler, PV-Sources, Grundrisse, Strategien, PPA, Tarife, Gain-Sharing-Verträge, Integration-Errors).
- Respektiert `tenant_id` (Multi-Tenancy) und `selectedLocationId`.
- Liefert `{ isReady: boolean, has: Record<string, boolean> }`.

**Neue Datei:** `src/lib/widgetRequirements.ts`
- Map `widgetType → (has) => boolean` mit den Regeln aus der Tabelle oben. Zentral wartbar.

**Änderung:** `src/pages/DashboardContent.tsx`
- Hook einbinden, `filteredVisibleWidgets` um Requirement-Prüfung erweitern.
- Ladezustand: Widgets erst rendern, wenn Availability-Check abgeschlossen (verhindert Flackern).

**Änderung:** `src/components/dashboard/DashboardCustomizer.tsx`
- Für nicht erfüllte Widgets ein dezentes Badge „Keine Daten vorhanden" + Tooltip mit Grund („PV-Anlage anlegen", „Dynamischen Tarif aktivieren" …) anzeigen.
- Toggle bleibt bedienbar (User kann bewusst aktivieren, wird trotzdem nicht gerendert bis Voraussetzung erfüllt ist).

**Keine DB-Änderungen** — nur Leseabfragen auf bestehende Tabellen.

## Nicht im Umfang

- Mobile-Dashboard-Widgets (nur Desktop wie gewünscht).
- Custom-Widgets (`custom_*`) — bleiben unverändert sichtbar.
- Änderungen an einzelnen Widget-Komponenten selbst.
- Neue DB-Migrationen oder Policies.
