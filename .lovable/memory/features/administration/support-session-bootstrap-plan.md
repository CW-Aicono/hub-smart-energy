---
name: Support-Session Bootstrap Plan
description: Plan to fix missing features/data in support sessions caused by per-user RLS rows (dashboard widgets, PV actuals, board layout, etc.)
type: feature
---

## Diagnose

In einer Support-Sitzung wird die Session des Super-Admins gegen die eines **technischen Support-Users** des Ziel-Tenants getauscht (`support-session-impersonate`). Für diesen Support-User gilt:

- Rolle: `admin` (setzt die Edge-Funktion beim Anlegen).
- `tenant_id` in `profiles` = Ziel-Tenant.
- **Keine** per-User-Datensätze in Tabellen wie `user_location_access`, `dashboard_widgets`, `board_user_layouts`, `user_preferences`, `pv_actual_hourly`-Zugriff usw.

Damit funktioniert alles, was per RLS nur `tenant_id = get_user_tenant_id()` prüft (Meter, Meter-Readings, Locations mit Admin-Bypass, KPI-Kacheln oben im Dashboard). Alles, was zusätzlich per-User-Zeilen erwartet, ist unsichtbar oder leer.

## Betroffene Funktionen (Recherche-Ergebnis)

Per RLS/Query auf `auth.uid()` gebunden — für den frisch erzeugten Support-User nicht vorhanden:

1. **Dashboard-Widgets** (`dashboard_widgets.user_id = auth.uid()`) — bereits im letzten Fix automatisch angelegt (Defaults + Custom).
2. **Aktueller Energieverbrauch / Energy-Chart** (`energy_chart`-Widget) — Widget-Zeile jetzt zwar vorhanden, aber Chart bleibt leer, weil der Support-User keine Layout-/Sichtbarkeits-Historie hat und die Standardgröße evtl. auf `is_visible=false` fällt bzw. das Widget beim Erst-Sync ohne `widget_size` angelegt wird (Höhe = 0). Zusätzlich betroffen von Punkt 3.
3. **PV-Actuals** (`pv_actual_hourly`) — RLS: `has_location_access(auth.uid(), location_id)`. Der Support-User hat **keine** `user_location_access`-Einträge, daher kein PV-Ist im Chart und in KPIs.
4. **Board-Layout** (`board_user_layouts.user_id = auth.uid()`) — persönliche Board-Anordnung startet leer.
5. **User-Preferences** (`user_preferences`) — Sprache/Farbschema/Theme werden pro Support-User neu angelegt, nicht die des Kunden-Users.
6. **Copilot-Prompt-Presets** (`copilot_prompt_presets.user_id`) — persönliche Copilot-Vorlagen fehlen.
7. **Getting-Started-Fortschritt** (`profiles.onboarding_*` / `getting_started_progress`, `user_id`-gebunden) — Wizard springt evtl. erneut auf.
8. **Sales-Projects** (`sales_projects.user_id`) — persönliche Angebote/Drafts unsichtbar.
9. **Charging-User-RFID-Tags & Community-Members** (`charging_user_rfid_tags.user_id`, `community_members.user_id`) — persönliche Ladekarten/Community-Mitgliedschaft fehlen.
10. **Copilot-Analytics-Queries** — tenant-scoped, funktioniert, aber „meine Verlaufsanfragen" fehlen (per user_id).
11. **Aufgaben/Benachrichtigungen mit `assignee_id`/`user_id`-Filter** (Tasks „meine offenen") — sichtbar sind nur Tenant-Aggregate, keine persönliche Zuweisung.

## Umsetzung

Zwei Ebenen:

**A) Automatischer Support-Bootstrap beim Anlegen des Support-Users** (in `support-session-impersonate`, einmalig pro Tenant):

- Nach `UPDATE user_roles SET role='admin'` zusätzlich für alle Locations des Tenants Einträge in `user_location_access` anlegen:
  ```sql
  INSERT INTO user_location_access(user_id, location_id)
  SELECT :support_user_id, id FROM locations WHERE tenant_id = :tenant_id
  ON CONFLICT DO NOTHING;
  ```
- Vor jedem Session-Start (auch für bereits existierende Support-User) die fehlenden Location-Zugriffe nachziehen — deckt später hinzugefügte Standorte ab.

**B) Frontend-seitiger Bootstrap für per-User-Widgets/Layouts** (bereits vorhanden für `dashboard_widgets`):

- In `useDashboardWidgets` beim Auto-Insert `widget_size: 'full'` explizit für **alle** Defaults setzen (nicht nur Custom), damit der Energy-Chart und andere Widgets sichtbare Höhe bekommen. Aktuell fehlt `widget_size` bei `defaultInserts` → Default-Wert der Tabelle kann `1/3` oder NULL sein → Chart rendert zu klein/leer.
- Board-Layout (`board_user_layouts`) erhält beim ersten Aufruf ein leeres Default-Objekt (kein Fix nötig, funktioniert bereits so).

**C) Keine Änderung** an:
- `user_preferences`, `copilot_prompt_presets`, `sales_projects`, `charging_user_rfid_tags`, `community_members`: Das sind bewusst persönliche Daten. Support soll dem User nicht dessen private Vorlagen/Ladekarten „übernehmen"; Anzeige der leeren Sicht ist korrekt.
- Bestehende RLS-Policies.

## Technische Details

- Edge-Funktion `support-session-impersonate/index.ts` erweitern:
  - Block „für existierenden Support-User": zusätzlich `INSERT ... ON CONFLICT DO NOTHING` in `user_location_access` für alle aktuellen Tenant-Locations.
  - Block „neuer Support-User" analog nach dem Rollen-Update.
- Migration nicht erforderlich (nur Datenoperationen zur Laufzeit über Service-Role).
- `src/hooks/useDashboardWidgets.tsx`: in `defaultInserts` und in `initializeDefaultWidgets` explizit `widget_size: "full"` mit übergeben.

## Verifikation

1. Neue Support-Sitzung starten → `user_location_access` enthält für den Support-User alle Locations des Tenants.
2. Dashboard lädt: Energy-Chart, PV-Forecast-Actuals, Location-Map, Floor-Plan-Explorer zeigen Daten.
3. Nach Anlegen einer neuen Location im Tenant → nächste Support-Sitzung enthält den Zugriff auf die neue Location.
