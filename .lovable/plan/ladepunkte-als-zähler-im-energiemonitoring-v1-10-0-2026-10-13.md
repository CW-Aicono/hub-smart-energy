# Ladepunkte als Zähler im Energiemonitoring (v1.10.0)

## Ziel
Jeder Ladepunkt steht im Energiemonitoring als eigener Stromzähler. Er bietet alles, was andere Zähler auch können: Verlauf und Diagramme, Tages-, Wochen- und Monatswerte, Dashboard-Widgets, Analytics Studio, Lastgang-Export, Alarmregeln, Kosten, Zählerhierarchie (z. B. unter dem Hauptzähler), Grundriss-Platzierung und virtuelle Zähler.

## Verhalten
- **Automatisch:** Jeder Ladepunkt mit Liegenschaft bekommt einen Zähler, auch neu angelegte. Name = Ladepunktname, Energieart Strom, Einheit kWh, Kennzeichnung „Ladepunkt“ mit Stecker-Symbol.
- **Werte:** Leistung (kW) und Zählerstand (kWh) kommen live von der Ladestation. Die Daten werden schon heute übertragen, sobald ein Zähler verknüpft ist.
- **Vorhandene Verknüpfungen bleiben:** Ist einem Ladepunkt schon ein Zähler zugeordnet, wird kein zweiter angelegt.
- **Synchron:** Ändern sich Name, Liegenschaft oder Archivierung des Ladepunkts, zieht der Zähler mit. Wird der Ladepunkt gelöscht, wird der Zähler archiviert. Die Historie bleibt erhalten.
- **Bearbeitbar:** Übergeordneter Zähler, Raum, Grundriss-Position, Alarme und Kosten pflegt man wie bei jedem Zähler. Name und Datenquelle sind gesperrt, weil die Ladestation sie vorgibt.
- **Historie:** Vorhandene Messwerte der Ladestation werden einmalig in den Zähler übernommen, soweit sie gespeichert sind. Danach füllen die üblichen Abläufe den Zähler (5-Minuten-Werte, Tageswerte).
- **Keine Doppelzählung:** Virtuelle Zähler, die Ladepunkte schon als Quelle nutzen, bleiben unverändert. Die Ladepunkt-Zähler hängen standardmäßig unter keinem anderen Zähler. Wer sie unter den Hauptzähler hängt, legt das bewusst fest.
- **Modul:** Die Zähler sind nur sichtbar, wenn der Kunde Energiemonitoring hat. Das Modul Ladeinfrastruktur bleibt unverändert.

## Prüfung
- Zuerst prüfe ich auf Staging: Wie viele Ladepunkte gibt es, welche sind schon verknüpft, welche Zählerdaten liegen vor und welche Erfassungsarten erlaubt die Datenbank.
- Danach Testladepunkt anlegen: Der Zähler erscheint mit Live-Leistung, Tageswert, Widget und Export. Bei Umbenennen oder Archivieren zieht der Zähler mit.
- Kontrolle bei ESB: Die Summen im Energiemonitoring ändern sich nicht ungewollt, keine Doppelzählung.

## Dokumentation
Version 1.10.0, Handbuch in 4 Sprachen, Änderungsprotokoll, Versionshinweise und Roadmap.

## Technische Details
- Migration (idempotent): Trigger `sync_charge_point_meter` auf `charge_points` (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER). Er legt den Zähler an oder aktualisiert ihn (`meters`: tenant_id, location_id, name, energy_type 'strom', unit 'kWh', capture_type 'automatic', device_type 'meter', meter_function 'consumption', neue nullable Spalte `source_charge_point_id`) und setzt `linked_meter_id`. Rekursionsschutz über `pg_trigger_depth()`. Backfill für bestehende Ladepunkte ohne Verknüpfung.
- Einmaliger Historien-Backfill aus `ocpp_meter_samples` → `meter_power_readings` / `meter_cumulative_readings`, danach `aggregate_raw_power_to_5min` bzw. Tageswerte für den vorhandenen Zeitraum.
- `ocpp-persistent-api` leitet bereits an `linked_meter_id` weiter; keine Änderung nötig.
- UI: Badge und Icon „Ladepunkt“ in Zählerliste, Device-Tree (`useDeviceTree` nutzt `source_charge_point_id` statt Namensheuristik) und EditMeterDialog (Name und Quelle schreibgeschützt). Link „Zum Ladepunkt“.
- Mandantentrennung bleibt erhalten: Der Zähler übernimmt `tenant_id` des Ladepunkts, die bestehenden RLS-Regeln gelten unverändert.
