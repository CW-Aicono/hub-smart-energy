## Ziel
Ladepunkte und Ladepunkt-Gruppen können einer Liegenschaft zugeordnet werden. Auf der Liegenschaftsseite erscheint ein neues Tab "Ladeinfrastruktur" mit den Messdaten der Ladepunkte – analog zur Zähler-Ansicht.

## Datenbank
- `charge_points.location_id` existiert bereits (nullable FK auf `locations`).
- Neue Spalte `charge_point_groups.location_id uuid` (nullable, FK `locations(id) ON DELETE SET NULL`) + Index.
- Effektive Zuordnung eines Ladepunkts: `charge_points.location_id` falls gesetzt, sonst `charge_point_groups.location_id` der Gruppe.

## UI – Zuordnung
- In Ladepunkt-Bearbeitungsdialog (`ChargePointDialog`): Liegenschaft-Auswahl (Dropdown, leer = "keine / via Gruppe").
- In Gruppen-Bearbeitungsdialog (`ChargePointGroupDialog`): gleiche Liegenschaft-Auswahl.

## UI – Tab "Ladeinfrastruktur"
- Datei: `src/pages/LocationDetail.tsx` (oder zuständige Tab-Komponente unter "Messstellen, Aktoren und Sensoren") um Tab erweitern.
- Tab sichtbar **nur**, wenn mindestens ein Ladepunkt direkt oder über eine zugeordnete Gruppe der Liegenschaft zugeordnet ist.
- Inhalt pro Ladepunkt (wie Zähler-Karten):
  - Name, Status-Badge, Standort-Quelle (direkt/Gruppe)
  - Aktueller Zählerstand (Summe kWh aus `charging_sessions.energy_kwh`)
  - Letzte 30 Tage kWh, letzte Session Zeit
  - Klick → führt zu `ChargePointDetail`
- Neuer Hook `useLocationChargePoints(locationId)` liefert effektiv zugeordnete Ladepunkte (Union direkt + via Gruppe).
- Neuer Hook `useChargePointMeterStats(chargePointIds)` aggregiert kWh aus `charging_sessions`.

## Scope
- Keine Änderungen an OCPP-Server, Billing oder DLM-Logik.
- Reine Zuordnungs- und Anzeigefunktion.

## Schritte
1. Migration: `location_id` zu `charge_point_groups` hinzufügen.
2. Hooks `useChargePointGroups` / `useChargePoints` um `location_id` erweitern.
3. Dropdown in beiden Edit-Dialogen.
4. Neuer Hook `useLocationChargePoints` + Stats-Hook.
5. Neues Tab + Karten-Komponente in LocationDetail einbinden.
