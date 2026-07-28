## Ursache (verifiziert)

Untersuchung aller Insert-Pfade in `meters` ergab:

- **Einziger Insert-Pfad**: `addMeter()` in `src/hooks/useMeters.tsx:94`, aufgerufen aus `AssignMeterDialog.tsx:100` („Gefundene Geräte" → „Zuordnen"). Kein Edge-Function, kein Worker, kein RPC legt Zähler an.
- **Kein DB-Uniqueness-Guard**: Auf `meters` existiert nur ein **nicht-uniquer** Index `meters_sensor_uuid_lower_tenant_idx (tenant_id, lower(sensor_uuid))`. Weder `sensor_uuid` noch `(tenant_id, location_integration_id, sensor_uuid)` noch `(name, location_id)` sind eindeutig.
- **Dedup nur im UI**: `SensorsDialog.tsx` filtert bereits zugeordnete Sensoren aus der React-Query-Cache (`staleTime: 30_000`). `addMeter` selbst prüft **nicht** vor dem Insert.

**Klassischer TOCTOU-Race**: Doppelklick auf „Zuordnen", zweiter Browser-Tab oder Wiederöffnen des Dialogs innerhalb der 30 s Stale-Fenster → beide Flows sehen den Sensor als „unassigned" → zwei Inserts mit identischer `sensor_uuid`. Die anschließende Loxone-Value-Sync (`loxone-api` fanned Werte an ALLE Meter mit passendem `location_integration_id`+`sensor_uuid` aus, `loxone-api/index.ts:1225,1497`) schreibt identische Live-Werte in beide Zeilen — exakt das beobachtete Bild (gleicher Name, gleiche -0,05 kW / 1,01 kWh / 683,17 kWh).

## Umsetzung

### 1. DB-Prävention (Migration)

- **Unique Partial Index** auf aktiven Auto-Zählern:
  ```
  CREATE UNIQUE INDEX meters_unique_active_sensor
    ON public.meters (tenant_id, location_integration_id, lower(sensor_uuid))
    WHERE sensor_uuid IS NOT NULL AND is_archived = false;
  ```
  Damit kann die DB Duplikate physisch nicht mehr aufnehmen — auch bei Rennen, mehreren Tabs oder Bugs in künftigem Code.
- **Vorher-Check**: Migration prüft, ob bereits Duplikate existieren; falls ja, wird der Index nach der Bereinigung (Schritt 3) angelegt. Deshalb wird die Bereinigung **vor** dem Index in derselben Migration ausgeführt (siehe unten).

### 2. Client-seitige Härtung

- `addMeter()` in `src/hooks/useMeters.tsx`: Vor dem Insert einen Select auf `(tenant_id, location_integration_id, lower(sensor_uuid))` mit `is_archived=false` durchführen. Wenn Treffer → statt Insert eine sanfte Meldung „Zähler bereits vorhanden" (Toast) und der bestehende Zähler wird zurückgegeben.
- `AssignMeterDialog.tsx`: Submit-Button während laufender Zuweisung mit `isSubmitting`-Guard sperren (verhindert Doppelklick).
- Fehlerbehandlung für Unique-Violation (Postgres-Code `23505`) im `addMeter`-Catch: freundliche Meldung statt roher Fehler.

### 3. Merge-Tool im Super-Admin

Neue Seite unter Super-Admin: **„Duplikate-Bereinigung Zähler"** (z. B. `/superadmin/meter-duplicates`).

- **Detektor** (Edge Function `meters-duplicates-scan`): Findet Duplikat-Gruppen tenant-weit per SQL:
  ```
  SELECT tenant_id, location_integration_id, lower(sensor_uuid), array_agg(id ORDER BY created_at)
  FROM meters
  WHERE sensor_uuid IS NOT NULL AND is_archived = false
  GROUP BY 1,2,3 HAVING count(*) > 1;
  ```
- **Vorschau-UI**: Pro Gruppe Anzeige aller betroffenen Zähler (Name, Standort, Anlage-Datum, Anzahl Readings, Widget-Verknüpfungen, Automations-Referenzen). „Master" = ältester Datensatz (kleinster `created_at`); „Duplikat(e)" = die jüngeren.
- **Merge-Aktion** (Edge Function `meters-merge-duplicates`, Service-Role, transaktional):
  1. Historische Daten auf Master umhängen: `UPDATE ... SET meter_id = master` in `meter_readings`, `meter_cumulative_readings`, `meter_power_readings`, `meter_power_readings_5min`, `meter_period_totals`, `meter_daily_totals_mv`, `meter_weekly_totals`, `meter_monthly_totals`, `meter_loxone_daily_snapshots`, `bridge_raw_samples` (soweit meter_id vorhanden), `charging_session_meter_records`, `energy_readings`, `document_links` (scope=meter), `floor_sensor_positions`.
  2. Konfig-Referenzen umhängen: `dashboard_widgets`, `custom_widget_definitions`, `location_automations` (Trigger/Actions per JSON-Rewrite mit Master-ID), `virtual_meter_sources.source_meter_id`, `alert_rules`, `monitoring_alert_rules`, `charge_point_economics`, `location_energy_sources`, `parent_meter_id` (Kinder auf Master umhängen).
  3. Bei Konflikten in Unique-Constraints (z. B. `meter_cumulative_readings` PK `(meter_id, reading_at)`): jüngerer Wert gewinnt via `ON CONFLICT DO UPDATE`.
  4. Duplikat-Meter archivieren (`is_archived=true`, `notes` prependen: „Merged into <master-id> am <datum> durch <admin>") — kein `DELETE`, damit ein Rollback möglich bleibt.
  5. Audit-Eintrag in `audit_logs` mit vollständigem Payload (master_id, merged_ids, betroffene Zeilenanzahlen pro Tabelle).
- **Bulk-Modus**: „Alle sicheren Duplikate zusammenführen" für Gruppen ohne widersprüchliche Konfiguration; Konflikt-Gruppen bleiben zur manuellen Prüfung offen.
- **Rechte**: Nur `super_admin`.

### 4. Reihenfolge in der Migration

1. Merge-Helper-Funktion (SECURITY DEFINER, `search_path=public`) als DB-Funktion anlegen (wird von Edge Function aufgerufen und bei Bedarf auch für die einmalige Vorab-Bereinigung genutzt).
2. Unique Partial Index anlegen — schlägt fehl, falls noch Duplikate existieren; deshalb ist der Merge-Schritt zuerst über die Super-Admin-UI in Produktion durchzuführen. Migration prüft mit `DO $$ ... IF EXISTS (dup...) THEN RAISE NOTICE ... ELSE CREATE UNIQUE INDEX ... END IF; $$;`, damit sie idempotent bleibt.
3. Nach Merge in Produktion (Rathaus/Hetzner) ein einzeiliges Follow-up-Migration-Skript, das den Unique-Index sicher anlegt (`CREATE UNIQUE INDEX IF NOT EXISTS ...`).

## Betroffene Dateien (technisch)

- Migration: `supabase/migrations/<timestamp>_prevent_duplicate_meters.sql`
- Edge Functions: `supabase/functions/meters-duplicates-scan/index.ts`, `supabase/functions/meters-merge-duplicates/index.ts`
- Frontend Hook: `src/hooks/useMeters.tsx` (Pre-Check + 23505-Handling)
- Frontend Dialog: `src/components/integrations/AssignMeterDialog.tsx` (Submit-Guard)
- Neue Super-Admin-Seite: `src/pages/SuperAdminMeterDuplicates.tsx` + Route + Sidebar-Eintrag unter „Verwaltung → Duplikate"
- i18n-Keys DE/EN/ES/NL

## Nicht Teil dieses Plans

- Keine Änderung an bereits archivierten Zählern (bleiben unberührt).
- Keine Retro-Bereinigung historischer Widget-Snapshots — Widgets werden auf den Master umgehängt, alte Renderings sind irrelevant.
- Keine Änderung an Loxone-Sync-Logik selbst (Fanning bleibt wie es ist, wird durch Unique-Index nutzlos für Duplikate).

Bitte bestätigen, dann setze ich es in dieser Reihenfolge um: Migration + Merge-Funktion → Super-Admin-Seite → Client-Härtung → Unique-Index als Follow-up nach erfolgter Bereinigung in Produktion.
