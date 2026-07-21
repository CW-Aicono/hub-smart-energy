# Plan: Modul "Reporting" für Ladeinfrastruktur

## Ziel
Neuer Menüpunkt **Reporting** unter *Ladeinfrastruktur*, zwischen *Abrechnung* und *Einstellungen*. Er erlaubt frei kombinierbare Auswertungen über Ladepunkte, Ladepunktgruppen, Nutzer, Nutzergruppen, Rechnungsgruppen und Zeiträume.

## Menü & Routing
- Sidebar (`DashboardSidebar.tsx` + `MobileSidebar.tsx`): neuer Eintrag `/charging/reporting` mit Icon *BarChart3*, Label `nav.chargingReporting`, positioniert **zwischen** `chargingBilling` und `chargingSettings`.
- Neue Route in `App.tsx` (auch Demo-Variante): `/charging/reporting` → `<M><ChargingReporting/></M>` (Modul-Guard).
- ModuleGuard: bestehender `charging`-Modul-Key wird wiederverwendet (kein neues billbares Modul — reine Reporting-Erweiterung des Ladeinfra-Moduls). Falls später gewünscht, kann ein Sub-Modul-Flag ergänzt werden.

## Seitenaufbau `ChargingReporting.tsx`
Ein einzelner Screen mit drei Blöcken:

### 1. Filterleiste (persistente Sticky-Bar)
- **Zeitraum**: DateRangePicker mit Presets (Heute, Diese Woche, Diesen Monat, YTD, Letzte 30/90 Tage, Frei wählbar) + Vergleichszeitraum (optional).
- **Granularität**: Stunde / Tag / Woche / Monat.
- **Gruppierung (Dimension)**: Ladepunkt, Ladepunktgruppe, Standort, Nutzer, Nutzergruppe, Rechnungsgruppe, Tarif, RFID-Tag.
- **Filter (Multi-Select)**: gleiche Entitäten wie Gruppierung, jeweils mit Suche.
- **Status-Filter**: nur bezahlte / nur offene / alle Sessions.
- **Metrik-Auswahl**: kWh, Umsatz (netto/brutto), Standzeit-Gebühr, Dauer, Anzahl Sessions, Ø kWh/Session, Ø €/kWh, Auslastung (%), Peak-Leistung kW, Idle-Anteil, CO₂-Ersparnis.

Filter-Zustand wird in URL-Query-Params gespiegelt (teilbar/bookmarkbar) und in `localStorage` gecached.

### 2. KPI-Kacheln (oben)
Fixe Kennzahlen für den aktuellen Filterschnitt vs. Vergleichszeitraum (Δ%):
- Sessions gesamt • kWh gesamt • Umsatz brutto • Ø Ladedauer • Auslastung • Ø €/kWh.

### 3. Frei konfigurierbare Analyse-Widgets
Nutzer legt eine Liste von Widgets an (Add-Button). Jedes Widget hat:
- Titel, Typ (**Balken, Linie, Fläche, Stacked-Bar, Donut, Heatmap Wochentag×Stunde, Tabelle mit Sortierung/Pagination**).
- Metrik + Dimension + optional Sekundär-Dimension (Serien-Split).
- Top-N-Cutoff, Sortierung.
- Reihenfolge per Drag-and-Drop; Layout wird pro User in `dashboard_widgets` (Kategorie `charging_report`) gespeichert — bestehende Tabelle nutzbar, kein neues Schema.

### Vordefinierte "Report-Presets"
Als Startpunkt zum Ein-Klick-Laden:
1. **Nutzer-Report** – Sessions/kWh/Umsatz je Nutzer, Ranking, Trend.
2. **Nutzergruppen-Report** – Vergleich Gruppen (z. B. Mitarbeiter vs. Gäste).
3. **Rechnungsgruppen-Report** – Umsatz pro Billing-Group, offene vs. bezahlte Rechnungen.
4. **Ladepunkt-Report** – kWh/Auslastung/Fehler je CP, Ranking, Ausfallzeiten (aus `charge_point_uptime_snapshots`).
5. **Ladepunktgruppen-Report** – Gruppenvergleich, Peak-Last, Gleichzeitigkeitsfaktor.
6. **Tarif-Report** – Umsatz/kWh je Tarif, Idle-Fee-Anteil.
7. **Zeit-Report** – Heatmap Wochentag×Stunde, Peak-Hours-Analyse.
8. **Roaming-Report** – Sessions/Umsatz aus `roaming_sessions`.

Presets speichern Filter + Widget-Set und können vom User dupliziert, umbenannt, geteilt (tenant-weit oder privat) und als Standard markiert werden.

## Export
- **CSV** (Client-seitig, alle sichtbaren Widget-Daten).
- **XLSX** über `@e965/xlsx` (bereits im Projekt) — ein Sheet je Widget + ein "Filter"-Sheet mit den Auswahl-Parametern.
- **PDF** über bestehende Report-Renderer-Pipeline (analog `EnergyReport.tsx`): serverseitig via Edge Function `charging-report-pdf` (neu, minimal — rendert HTML mit den Aggregaten).
- **Geplanter Versand**: Wiederverwendung `report_schedules` (existiert), neuer `report_type = 'charging'` mit gespeichertem Preset + Empfängerliste; Cron-Job `charging-report-scheduler` (neu, klein).

## Daten & Performance
Alle Auswertungen laufen client-seitig gegen bestehende Tabellen — keine neuen Kern-Tabellen nötig:
- `charging_sessions` (kWh, Dauer, CP, User via `id_tag`/RFID).
- `charging_invoices` (Umsatz, Idle-Fee, Status, `billing_group_id`).
- `charging_session_meter_records` (Peak-Leistung, Idle-Erkennung).
- `charge_points`, `charge_point_groups`, `charge_point_uptime_snapshots` (Auslastung/Stabilität).
- `charging_users`, `charging_user_groups`, `charging_user_rfid_tags` (Nutzer-Dimension).
- `charging_billing_groups`, `charging_billing_group_members` (Rechnungsgruppen).
- `charging_tariffs` (Tarif-Zuordnung).
- `roaming_sessions` (Roaming-Preset).

Für schwere Aggregate (Multi-Monats-Reports) neue **SQL-RPC-Funktionen** (SECURITY DEFINER, `tenant_id`-scoped) statt Rohdaten-Pulls:
- `report_charging_by_dimension(_tenant, _from, _to, _dimension, _metric, _filters jsonb)` – liefert bereits aggregierte Rows.
- `report_charging_heatmap(_tenant, _from, _to, _filters jsonb)` – Wochentag×Stunde.
- `report_charging_kpis(_tenant, _from, _to, _filters jsonb, _compare_from, _compare_to)` – KPI-Kacheln inkl. Vergleich.

Aggregation im PL/pgSQL mit `date_trunc`, `filter (where …)`, Joins über CP/User/Group. So bleibt Netzwerk-Payload und Browser-Last klein.

## Zugriffskontrolle
- Sichtbar nur mit Rolle `admin`, `manager` oder Custom-Rolle mit Permission `charging.view` (bestehend). Neue Permission `charging.report.export` für Export/Schedule (nur admin/manager per Default).
- Alle RPCs prüfen `tenant_id = get_current_tenant_id()` und Rollen-Zugehörigkeit → keine Datenlecks über Preset-Sharing.

## Umsetzung in Phasen
1. **Phase 1 (MVP)**: Menüpunkt, Route, ModuleGuard, Filterleiste, KPI-Kacheln, 3 Basis-Widgets (Tabelle Nutzer, Balken Ladepunkte, Zeit-Linie), CSV-Export. Presets "Nutzer-Report" + "Ladepunkt-Report".
2. **Phase 2**: Drag-and-Drop-Layout, Speicherung Presets, alle 8 Presets, Heatmap, XLSX-Export.
3. **Phase 3**: PDF-Export, geplanter Versand via `report_schedules`, Vergleichszeiträume, Roaming-Preset.

## Technisches (Kurz)
- Neue Datei: `src/pages/ChargingReporting.tsx`.
- Neuer Ordner `src/components/charging/reporting/` mit `FilterBar.tsx`, `KpiTiles.tsx`, `WidgetGrid.tsx`, `WidgetRenderer.tsx`, `PresetSelector.tsx`, `ExportMenu.tsx`.
- Neuer Hook: `src/hooks/useChargingReport.tsx` (kapselt RPC-Calls + React-Query-Caching, `staleTime: 5min`).
- i18n-Keys (`nav.chargingReporting`, `chargingReport.*`) für DE/EN/ES/NL.
- Charts: `recharts` (bereits genutzt), Heatmap als eigenes SVG-Grid.
- Zahlen konsequent `toLocaleString("de-DE")` (Core-Regel).
- Neue Migration: 3 RPC-Funktionen + `GRANT EXECUTE … TO authenticated`.
- Keine neuen billbaren Module — reine Erweiterung des `charging`-Moduls.
