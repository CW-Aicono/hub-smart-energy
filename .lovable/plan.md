

# Plan: Redundante Datensicherung und Backup-Funktion

## Ausgangslage

Das Projekt hat aktuell **keine Backup-Funktionalitaet**. Es gibt 70+ Datenbanktabellen, 4 Storage-Buckets und keine Moeglichkeit fuer Admins, Daten zu sichern oder wiederherzustellen. Die einzige existierende Export-Funktion ist ein CSV/PDF-Export fuer Energiedaten.

---

## Strategie: Drei Sicherungsebenen

```text
Ebene 1: Automatische DB-Snapshots (Infrastruktur)
  -- Taegliche automatische Sicherung der gesamten Datenbank
  -- Durch Lovable Cloud / Hosting-Provider bereitgestellt
  -- Keine Code-Aenderung noetig, nur Konfiguration

Ebene 2: Tenant-Datenexport (In-App Backup)
  -- Admin kann alle Mandantendaten als JSON exportieren
  -- Edge Function sammelt alle tenant-relevanten Tabellen
  -- Download als strukturierte JSON-Datei

Ebene 3: Automatische Backup-Snapshots (Scheduled)
  -- pg_cron Job erstellt periodisch Mandanten-Snapshots
  -- Speicherung in einer backup_snapshots Tabelle
  -- Aufbewahrungspolitik: 30 Tage
```

---

## Umsetzung

### 1. Neue Datenbanktabelle: `backup_snapshots`

Speichert Metadaten und Inhalt der automatischen Mandanten-Backups.

```text
backup_snapshots
  id            UUID (PK)
  tenant_id     UUID (FK tenants)
  created_at    timestamptz
  created_by    UUID (nullable, auth user)
  backup_type   text ('manual' | 'scheduled')
  status        text ('completed' | 'failed')
  tables_count  integer
  rows_count    integer
  size_bytes    bigint
  data          jsonb       -- die eigentlichen Backup-Daten
  expires_at    timestamptz -- Aufbewahrungsfrist
```

RLS: Nur Admins des eigenen Tenants koennen lesen/erstellen. Alte Eintraege werden per Trigger/Cron bereinigt.

### 2. Neue Edge Function: `tenant-backup`

Sammelt alle mandantenrelevanten Daten und gibt sie als JSON zurueck oder speichert sie in `backup_snapshots`.

**Gesicherte Tabellen (pro Tenant):**

```text
Konfiguration:     tenants, locations, floors, floor_rooms, meters,
                   virtual_meter_sources, integrations, location_integrations,
                   alert_rules, location_automations, energy_prices,
                   dashboard_widgets, email_templates, pv_forecast_settings

Benutzerdaten:     profiles, user_roles, user_location_access, user_preferences

Messdaten:         meter_period_totals, meter_readings, energy_readings
                   (meter_power_readings und _5min werden NICHT gesichert
                    -- zu gross, werden ohnehin taeglich komprimiert)

Ladeinfrastruktur: charge_points, charging_sessions, charging_users,
                   charging_tariffs, charging_invoices, charge_point_groups

Aufgaben:          tasks, task_history

Sonstiges:         report_schedules, brighthub_settings, tenant_modules
```

**Aktionen:**

| Aktion | Beschreibung |
|---|---|
| `export` | Gibt JSON direkt als Download zurueck |
| `snapshot` | Speichert in backup_snapshots Tabelle |
| `list` | Listet vorhandene Snapshots |
| `restore-preview` | Zeigt Diff zwischen Snapshot und aktuellem Stand |

### 3. Frontend: Backup-Bereich in den Einstellungen

Neuer Tab oder Abschnitt auf der Settings-Seite (nur fuer Admins):

```text
Einstellungen > Datensicherung
  +------------------------------------------+
  | Manuelle Sicherung                       |
  | [Backup erstellen]  [Als JSON laden]     |
  +------------------------------------------+
  | Automatische Sicherungen                 |
  | Intervall: [Taeglich v]                  |
  | Aufbewahrung: 30 Tage                    |
  +------------------------------------------+
  | Vorhandene Sicherungen                   |
  | 27.02.2026 03:00  auto   42 Tabellen     |
  | 26.02.2026 03:00  auto   42 Tabellen     |
  | 25.02.2026 14:22  manuell 42 Tabellen    |
  |                          [Laden] [Loeschen]|
  +------------------------------------------+
```

### 4. Automatischer Backup-Cronjob

Ein `pg_cron` Job ruft taeglich die Edge Function auf, um einen Snapshot zu erstellen. Ein zweiter Job bereinigt abgelaufene Snapshots (aelter als 30 Tage).

### 5. Storage-Backup (Dateien)

Fuer die Storage-Buckets (`meter-photos`, `tenant-assets`, `floor-plans`, `floor-3d-models`) wird eine Liste aller Dateipfade ins Backup-JSON aufgenommen. Die Dateien selbst werden nicht in die DB kopiert, da sie ueber signierte URLs zugaenglich bleiben. Ein vollstaendiges Datei-Backup erfordert externe Infrastruktur (z.B. S3-Sync) und wird als Empfehlung dokumentiert.

---

## Dateien und Aenderungen

| Datei | Aenderung |
|---|---|
| `supabase/functions/tenant-backup/index.ts` | Neue Edge Function |
| `supabase/config.toml` | JWT-Config fuer tenant-backup |
| Migration SQL | Tabelle `backup_snapshots` + RLS + Cleanup-Trigger |
| `src/components/settings/BackupSettings.tsx` | Neue UI-Komponente |
| `src/pages/Settings.tsx` | BackupSettings einbinden |
| `src/hooks/useBackups.tsx` | Hook fuer Backup-Operationen |
| `src/i18n/translations.ts` | Uebersetzungen fuer Backup-UI |

---

## Sicherheitsaspekte

- Backup-Daten enthalten **keine Passwoerter** (auth.users wird nicht gesichert)
- Verschluesselte API-Keys (AES-256-GCM) bleiben verschluesselt im Backup
- RLS stellt sicher, dass nur der eigene Mandant seine Backups sieht
- Die Edge Function nutzt den Service-Role-Key fuer den Zugriff
- JSONB-Spalte begrenzt auf ca. 500 MB pro Eintrag (PostgreSQL-Limit)

## Einschraenkungen

- **Kein Point-in-Time-Recovery** -- das erfordert Infrastruktur-Level-Backups
- **Keine automatische Wiederherstellung** -- nur Export/Download; Restore muesste manuell oder ueber eine separate Funktion erfolgen
- **Hochfrequente Messdaten** (meter_power_readings) werden nicht gesichert -- diese sind ohnehin transient und werden taeglich in 5-Min-Aggregate komprimiert

