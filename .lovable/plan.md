## Problem

Der virtuelle Zähler „Ladepunkt Ost 1" bezieht seine Quelle aus dem OCPP-Ladepunkt `Ost 1` (per `virtual_meter_sources.source_charge_point_id`). In der DB kommen die OCPP-Samples (Power ≈ 10,5 kW, Energie 1,12 kWh) sauber an, aber:

- `meter_power_readings` für den virtuellen Zähler: **0 Zeilen** in den letzten 2 h.
- `meter_cumulative_readings` für den virtuellen Zähler: **0 Zeilen**.

Grund: In `supabase/functions/ocpp-persistent-api/index.ts` (`insert-meter-samples`, Zeile ~555–575) wird OCPP-Leistung **nur dann** in `meter_power_readings` gespiegelt, wenn am Ladepunkt `charge_points.linked_meter_id` gesetzt ist. Für Ost 1 ist das nicht der Fall — der Zähler ist stattdessen als **virtueller Zähler mit `virtual_meter_sources` → source_charge_point_id** verknüpft. Energie (Energy.Active.Import.Register) wird gar nicht in `meter_cumulative_readings` weitergereicht.

Ergebnis: Alle Dashboard-Widgets, die den virtuellen Zähler aus `meter_power_readings_5min` / `meter_cumulative_readings` lesen (KPIs, 24h-Chart, Energie-Kacheln), zeigen leere Werte. Nur der `VirtualBalanceBreakdown` funktioniert, weil er live aus `ocpp_meter_samples` rechnet.

## Lösung

OCPP-Samples werden zusätzlich in **alle virtuellen Zähler** gespiegelt, die den jeweiligen Ladepunkt (direkt, per Gruppe oder per „alle CPs der Liegenschaft") als Quelle haben. Damit haben virtuelle CP-Zähler dieselben persistierten Daten wie physische Zähler und alle Widgets/Reports funktionieren automatisch.

### Änderungen

**1. `supabase/functions/ocpp-persistent-api/index.ts` – `insert-meter-samples`**

Nach dem bestehenden `linked_meter_id`-Forward folgenden Block ergänzen:

- Alle betroffenen `virtual_meter_sources` laden, die diesen Ladepunkt referenzieren:
  - `source_charge_point_id = cp.id`
  - **oder** `source_charge_point_group_id = cp.group_id` (falls Gruppe gesetzt)
  - **oder** `source_all_charge_points = true` (Zähler-`location_id` muss dem CP-Standort entsprechen)
- Für jeden gefundenen virtuellen Zähler und jedes `Power.Active.Import`-Sample eine Zeile in `meter_power_readings` einfügen (kW, Vorzeichen aus `operator`).
- Für jeden gefundenen virtuellen Zähler und jedes `Energy.Active.Import.Register`-Sample eine Upsert-Zeile in `meter_cumulative_readings` einfügen (`reading_value` in kWh, `reading_type='automatic'`, mit Vorzeichen — bei `operator='-'` als negative Delta-Absicht überspringen bzw. Zähler-Semantik beibehalten; siehe Detail unten).

**2. Energie-Semantik für virtuelle Zähler**

`meter_cumulative_readings` speichert monotone Zählerstände. Für eine 1:1-Ladepunkt-Quelle ist das der CP-Zählerstand. Bei Aggregation mehrerer CPs (Gruppe / all-CPs) wird pro Sample ein **Summenzählerstand** aller involvierten CPs zum Zeitpunkt `sampled_at` berechnet und geschrieben (Ost 1: nur 1 Quelle → identisch mit CP-Stand). Bei `operator='-'` wird die Quelle nicht in den Zählerstand aufgenommen (dieser Fall ergibt für Energie ohnehin selten Sinn und würde monotonie brechen).

**3. Idempotenz / Duplikate**

- `meter_power_readings`: pro `(meter_id, recorded_at)` nur einmal einfügen (ON CONFLICT DO NOTHING falls Unique-Index vorhanden, sonst simple Deduplizierung im Code).
- `meter_cumulative_readings`: pro `(meter_id, reading_date, reading_type='automatic')` upserten. Innerhalb desselben Tages den letzten Wert übernehmen.

**4. Backfill (optional, kleiner Migration-Job)**

Einmalig `ocpp_meter_samples` der letzten 24 h für alle CP-referenzierenden virtuellen Zähler in `meter_power_readings` und `meter_cumulative_readings` nachziehen, damit das 24h-Chart sofort Historie zeigt.

### Nicht Teil dieses Plans

- Keine UI-Änderungen. `VirtualBalanceBreakdown` und `useVirtualBalance` bleiben unverändert.
- Keine Änderung an Simulations- oder Meter-Quellen des virtuellen Zählers.

### Technische Details

- Der Forward-Block wird nur einmal pro `insert-meter-samples`-Request gebaut (ein `select` auf `virtual_meter_sources` + ein `select` auf `charge_points` für Gruppe/Standort), unabhängig von der Sample-Anzahl.
- `ocpp-persistent-api` läuft mit Service-Role → RLS-frei, aber neuen Insert-Pfad trotzdem gegen bestehende Policies auf `meter_power_readings` / `meter_cumulative_readings` prüfen.
- Nach dem Deploy sollten innerhalb weniger Minuten Werte im Dashboard-Widget „Ladepunkt Ost 1" erscheinen (KPIs + 24h-Chart + Energie).