# Virtueller Zähler erweitert um Ladepunkt-Quellen

## Ziel
Im „Zähler hinzufügen"-Dialog kann unter dem Baustein „Virtueller Zähler" zusätzlich zu echten Zählern auch eine beliebige Kombination aus Ladepunkten, Ladepunkt-Gruppen oder „Alle Ladepunkte dieser Liegenschaft" als Quelle gewählt werden. Mischen mit normalen Zählern ist erlaubt. Live-Leistung kommt aus OCPP MeterValues, kWh-Summen aus `charging_sessions`. Vorbereitet für V2G/V2H (bidirektional).

## Wichtiger Datenbefund
- Live-Leistung der Ladepunkte liegt **nicht** als Spalte vor, sondern in `ocpp_meter_samples` (measurand = `Power.Active.Import` / `Power.Active.Export`, Spalte `value` in W).
- kWh-Summen kommen aus `charging_sessions.energy_kwh` (Felder `start_time`, `stop_time`, `charge_point_id`).
- Bidirektionalität ist heute nur über Export-measurands sichtbar — Schema dafür ist bereits ausreichend, kein extra DB-Feld nötig.

## Änderungen

### 1. Datenbank (Migration)
Tabelle `public.virtual_meter_sources` erweitern:
- `source_meter_id`: NOT NULL → NULLABLE
- Neue Spalten (alle nullable, alle FK ON DELETE CASCADE):
  - `source_charge_point_id` → `charge_points(id)`
  - `source_charge_point_group_id` → `charge_point_groups(id)`
  - `source_all_charge_points` boolean DEFAULT false (löst zur Laufzeit alle CPs der Liegenschaft des virtuellen Zählers auf)
- Bestehende `UNIQUE(virtual_meter_id, source_meter_id)` droppen, ersetzen durch partielle Unique-Indizes je Quelltyp.
- CHECK-Constraint: genau eine der vier Quellen pro Zeile gesetzt.

### 2. Formel-Builder UI (`VirtualMeterFormulaBuilder.tsx`)
- Props um `availableChargePoints` und `availableChargePointGroups` erweitern.
- Quell-Dropdown in vier Gruppen (Select-Groups): Zähler / Ladepunkte / Ladepunkt-Gruppen / „Alle Ladepunkte dieser Liegenschaft".
- Source-Item rendert je nach Typ Icon (PlugZap für CPs, Users für Gruppen, MapPin für „Alle"), Operator + / − wie bisher.
- Formel-Vorschau zeigt den jeweiligen Namen/Label.

### 3. Add/Edit-Dialoge (`AddMeterDialog.tsx`, `EditMeterDialog.tsx`)
- Über `useLocationChargePoints(locationId)` und `useChargePointGroups` (gefiltert auf Liegenschaft) die Listen laden und an den Builder reichen.
- `useMeters.addMeter` / Update-Logik erweitern, sodass die neuen Quell-Typen mitgespeichert werden (Insert in `virtual_meter_sources` mit dem jeweils passenden Feld).

### 4. Berechnungs-Layer
- `src/hooks/useEnergyData.tsx`: 
  - Beim Laden auch `source_charge_point_id`, `source_charge_point_group_id`, `source_all_charge_points` aus `virtual_meter_sources` selecten.
  - Für CP-Quellen die jüngsten `ocpp_meter_samples` (Power.Active.Import minus Power.Active.Export, Fenster letzte 5 Min) als Live-kW heranziehen. Tagessumme aus `charging_sessions.energy_kwh` (`start_time >= heute_00:00`).
  - Gruppen/„Alle"-Auflösung anhand bereits geladener CPs der Liegenschaft.
- `src/pages/LiveValues.tsx`: dieselbe Auflösungslogik in den `virtualValues`-Memo einbauen.

### 5. Bidirektional-Vorbereitung
- Wenn beide measurands (Import + Export) für einen CP existieren, wird `virtuell` automatisch als bidirektional behandelt: positiver Wert = Bezug (Laden), negativer Wert = Einspeisung (V2G/V2H). Kein extra UI-Flag nötig — passt automatisch in das bestehende `meters.is_bidirectional`-System, das `MeterManagement` schon rendert.

## Was nicht geändert wird
- OCPP-Server-Code, Billing-Pipeline, DLM/PV-Surplus-Logik. 
- Bestehende virtuelle Zähler mit reiner Zähler-Formel funktionieren unverändert weiter.

## Reihenfolge (Migration zuerst)
1. Migration einreichen → User bestätigt → Types werden regeneriert
2. Builder + Dialoge + Hooks in einem Commit
3. Sichtkontrolle: neuen virtuellen Zähler „Alle Wallboxen" anlegen, prüfen ob Live-kW und Tagessumme stimmen.
