## Ziel

Im Widget-Designer (Energieflussmonitor → Knoten-Konfiguration) soll pro Knoten mit gewähltem Zähler die **Flussrichtungserkennung** einstellbar sein — mit denselben zwei Optionen wie in „Messstellen → Zähler bearbeiten":

- „Lieferung = negativer Wert / Bezug = positiver Wert (Standard)" (`negative_delivery`)
- „Lieferung = positiver Wert / Bezug = negativer Wert" (`positive_delivery`)

Die Einstellung ist **synchronisiert** mit der bereits vorhandenen Einstellung in der Messstellen-Übersicht, d. h. beide Stellen lesen und schreiben dieselbe Spalte `meters.flow_direction_convention`. Eine Änderung an einem Ort wirkt sofort am anderen und wird vom `EnergyFlowMonitor` beim Rendern verwendet (nutzt bereits `meterRow?.flow_direction_convention`).

## Umsetzung

Datei: `src/components/settings/EnergyFlowDesigner.tsx`

1. Pro Knoten mit `meter_id` einen zusätzlichen `<Select>` „Flussrichtungserkennung" unter dem Rollen-/Zähler-Grid einblenden.
2. Wert wird direkt aus der übergebenen `meters`-Prop gelesen (`meter.flow_direction_convention`, Fallback `negative_delivery`).
3. Bei Änderung: `supabase.from("meters").update({ flow_direction_convention: v }).eq("id", meter_id)`, danach die relevanten Queries invalidieren (`["meters"]` und `["custom_widget_definitions"]` per `queryClient.invalidateQueries`), damit sowohl EditMeterDialog als auch der Live-Monitor den neuen Wert erhalten. Toast bei Erfolg/Fehler.
4. Ohne gewählten Zähler wird das Feld nicht angezeigt.

Keine Migration nötig — Spalte existiert bereits. Keine Änderung am `CustomWidgetConfig`-Typ, da die Konvention weiterhin am Zähler hängt (Single Source of Truth).

## Was nicht geändert wird

- `EditMeterDialog.tsx`, `EnergyFlowMonitor.tsx`, DB-Schema, RLS — alles bleibt unverändert.
- Keine neue Config-Property auf dem Widget selbst.
